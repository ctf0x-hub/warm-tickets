import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Ticket, Zap } from "lucide-react";
import { Helmet } from "react-helmet-async";
import heroImg from "@/assets/hero.jpg";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>PULSE — Discover live events, concerts & festivals</title>
        <meta
          name="description"
          content="Browse and book tickets for concerts, conferences, festivals and more on PULSE — the bold new way to experience live events."
        />
      </Helmet>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImg}
            alt=""
            width={1920}
            height={1080}
            className="h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
          <div className="absolute inset-0 bg-radial-glow" />
        </div>

        <div className="container relative pt-24 pb-32 md:pt-32 md:pb-40">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur mb-6 animate-in fade-in slide-in-from-bottom-2">
              <Sparkles className="h-3 w-3" />
              The new way to experience live events
            </div>

            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.95] tracking-tight mb-6">
              Feel every <span className="text-gradient">moment</span>.
              <br />
              Live every <span className="text-gradient">beat</span>.
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
              From sold-out concerts to intimate workshops — discover the events
              that move you, secure your seat in seconds, and walk in with a
              single scan.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="bg-gradient-primary hover:opacity-90 shadow-glow border-0 text-base h-12 px-8"
              >
                <Link to="/events">
                  Discover events <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-8 border-border/60 hover:bg-muted text-base"
              >
                <Link to="/auth?mode=signup">Become an organizer</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="container -mt-16 relative z-10">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Ticket,
              title: "Instant tickets",
              desc: "Book in seconds, get your QR code instantly.",
            },
            {
              icon: Zap,
              title: "Live seat counts",
              desc: "Watch availability tick down in real time.",
            },
            {
              icon: Sparkles,
              title: "Curated by humans",
              desc: "Every event reviewed for quality before going live.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-6 transition-smooth hover:border-primary/40 hover:shadow-card"
            >
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-lg mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container py-32">
        <div className="rounded-3xl bg-gradient-hero p-12 md:p-16 text-center shadow-elegant relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_60%)]" />
          <div className="relative">
            <h2 className="font-display text-3xl md:text-5xl font-bold text-white mb-4">
              Ready to find your next moment?
            </h2>
            <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
              Thousands of events. One platform. Zero friction.
            </p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="h-12 px-8 bg-white text-foreground hover:bg-white/90"
            >
              <Link to="/events">Browse all events</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
};

export default Index;
