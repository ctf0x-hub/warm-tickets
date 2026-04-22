import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Helmet } from "react-helmet-async";

const Auth = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialMode = params.get("mode") === "signup" ? "signup" : "signin";
  const wantsOrganizer = params.get("as") === "organizer";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [asOrganizer, setAsOrganizer] = useState(wantsOrganizer);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { name },
          },
        });
        if (error) throw error;
        if (asOrganizer) {
          // Session is established immediately (auto-confirm on); promote to organizer.
          const { error: rpcErr } = await supabase.rpc("become_organizer");
          if (rpcErr) {
            toast.warning("Signed up, but couldn't activate organizer role", {
              description: rpcErr.message,
            });
          } else {
            toast.success("Welcome to PULSE!", { description: "Organizer account ready." });
            navigate("/organizer");
            return;
          }
        } else {
          toast.success("Welcome to PULSE!", { description: "You're signed in." });
        }
        navigate("/");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{mode === "signup" ? "Sign up" : "Sign in"} — PULSE</title>
      </Helmet>
      <div className="container max-w-md py-20">
        <Card className="p-8 bg-gradient-card border-border/50 shadow-elegant">
          <Link to="/" className="flex items-center gap-2 justify-center mb-8">
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="font-display text-xl font-bold">PULSE</span>
          </Link>
          <h1 className="font-display text-2xl font-bold text-center mb-2">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            {mode === "signup"
              ? "Start discovering events in seconds"
              : "Sign in to your account"}
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-1.5"
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1.5"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-primary hover:opacity-90 border-0 shadow-glow h-11"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground mt-6">
            {mode === "signup" ? "Already have an account?" : "New to PULSE?"}{" "}
            <button
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="text-primary hover:underline font-medium"
            >
              {mode === "signup" ? "Sign in" : "Sign up"}
            </button>
          </p>
        </Card>
      </div>
    </>
  );
};

export default Auth;
