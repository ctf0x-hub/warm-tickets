-- ============================================
-- ROLES ENUM + USER_ROLES TABLE
-- ============================================
CREATE TYPE public.app_role AS ENUM ('attendee', 'organizer', 'admin');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT NOT NULL,
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SECURITY DEFINER ROLE CHECK
-- ============================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============================================
-- PROFILES + USER_ROLES POLICIES
-- ============================================
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins update profiles" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- AUTO-CREATE PROFILE + DEFAULT ROLE ON SIGNUP
-- Hardcoded admin: root@0xrobiul.me
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email
  );

  IF NEW.email = 'root@0xrobiul.me' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'attendee');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- EVENT TYPES + TAGS (admin-managed)
-- ============================================
CREATE TABLE public.event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.event_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads event_types" ON public.event_types
  FOR SELECT USING (true);
CREATE POLICY "Admins manage event_types" ON public.event_types
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone reads event_tags" ON public.event_tags
  FOR SELECT USING (true);
CREATE POLICY "Admins manage event_tags" ON public.event_tags
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed initial types and tags
INSERT INTO public.event_types (name, slug, description) VALUES
  ('Concert', 'concert', 'Live music performances'),
  ('Conference', 'conference', 'Professional gatherings and talks'),
  ('Workshop', 'workshop', 'Hands-on learning sessions'),
  ('Sports', 'sports', 'Sporting events and tournaments'),
  ('Festival', 'festival', 'Multi-day cultural celebrations'),
  ('Exhibition', 'exhibition', 'Art and trade exhibitions'),
  ('Theatre', 'theatre', 'Plays and theatrical performances'),
  ('Networking', 'networking', 'Professional networking events'),
  ('Charity', 'charity', 'Fundraising and charity events'),
  ('Online', 'online', 'Virtual events');

INSERT INTO public.event_tags (name, slug) VALUES
  ('outdoor', 'outdoor'),
  ('indoor', 'indoor'),
  ('family-friendly', 'family-friendly'),
  ('18+', '18-plus'),
  ('free', 'free'),
  ('charity', 'charity'),
  ('live-music', 'live-music'),
  ('food', 'food'),
  ('international', 'international');

-- ============================================
-- EVENTS
-- ============================================
CREATE TYPE public.event_status AS ENUM (
  'draft',
  'pending_approval',
  'approved',
  'published',
  'pending_edit_approval',
  'cancelled',
  'rejected'
);

CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type_id UUID REFERENCES public.event_types(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  venue TEXT,
  city TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  banner_image TEXT,
  status event_status NOT NULL DEFAULT 'draft',
  rejection_reason TEXT,
  search_vector TSVECTOR,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_search_vector ON public.events USING GIN(search_vector);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_starts_at ON public.events(starts_at);
CREATE INDEX idx_events_organizer ON public.events(organizer_id);

CREATE TABLE public.event_tag_map (
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.event_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, tag_id)
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tag_map ENABLE ROW LEVEL SECURITY;

-- Events policies
CREATE POLICY "Anyone reads published events" ON public.events
  FOR SELECT USING (status = 'published' AND deleted_at IS NULL);
CREATE POLICY "Organizers read own events" ON public.events
  FOR SELECT USING (auth.uid() = organizer_id);
CREATE POLICY "Admins read all events" ON public.events
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Organizers create events" ON public.events
  FOR INSERT WITH CHECK (
    auth.uid() = organizer_id
    AND (public.has_role(auth.uid(), 'organizer') OR public.has_role(auth.uid(), 'admin'))
  );
CREATE POLICY "Organizers update own events" ON public.events
  FOR UPDATE USING (auth.uid() = organizer_id);
CREATE POLICY "Admins update all events" ON public.events
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Organizers delete own events" ON public.events
  FOR DELETE USING (auth.uid() = organizer_id);

-- Tag map policies
CREATE POLICY "Anyone reads tag_map for published events" ON public.event_tag_map
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status = 'published' AND e.deleted_at IS NULL)
  );
CREATE POLICY "Organizers read own tag_map" ON public.event_tag_map
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  );
CREATE POLICY "Admins read all tag_map" ON public.event_tag_map
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Organizers manage own tag_map" ON public.event_tag_map
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  );
CREATE POLICY "Admins manage all tag_map" ON public.event_tag_map
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SEARCH VECTOR TRIGGER (events + tags)
-- ============================================
CREATE OR REPLACE FUNCTION public.events_update_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  tag_text TEXT;
BEGIN
  SELECT COALESCE(string_agg(t.name, ' '), '') INTO tag_text
  FROM public.event_tag_map m
  JOIN public.event_tags t ON t.id = m.tag_id
  WHERE m.event_id = NEW.id;

  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.venue, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.city, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(tag_text, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_events_search_vector
  BEFORE INSERT OR UPDATE OF title, description, venue, city ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_update_search_vector();

-- Refresh search vector when tag map changes
CREATE OR REPLACE FUNCTION public.refresh_event_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  v_event_id := COALESCE(NEW.event_id, OLD.event_id);
  UPDATE public.events SET updated_at = now() WHERE id = v_event_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_event_tag_map_refresh
  AFTER INSERT OR DELETE ON public.event_tag_map
  FOR EACH ROW EXECUTE FUNCTION public.refresh_event_search_vector();

-- ============================================
-- EVENT APPROVAL REQUESTS
-- ============================================
CREATE TYPE public.approval_request_type AS ENUM ('publish', 'edit');
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.event_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type approval_request_type NOT NULL,
  snapshot JSONB NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_approval_status ON public.event_approval_requests(status);
CREATE INDEX idx_approval_event ON public.event_approval_requests(event_id);

ALTER TABLE public.event_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers view own requests" ON public.event_approval_requests
  FOR SELECT USING (auth.uid() = organizer_id);
CREATE POLICY "Admins view all requests" ON public.event_approval_requests
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Organizers create own requests" ON public.event_approval_requests
  FOR INSERT WITH CHECK (auth.uid() = organizer_id);
CREATE POLICY "Admins update requests" ON public.event_approval_requests
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- HELPER: organizer self-promote when creating first event
-- (attendees can request organizer role; for Phase 1 we let any signed-in user become organizer on demand via this RPC)
-- ============================================
CREATE OR REPLACE FUNCTION public.become_organizer()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'organizer')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;