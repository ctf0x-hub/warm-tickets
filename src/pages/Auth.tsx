import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Helmet } from "react-helmet-async";

const Auth = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { name },
          },
        });
        if (error) throw error;

        if (!data.session) {
          toast.success("Check your email", {
            description: "Confirm your email to finish signing in.",
          });
          return;
        }

        toast.success("Welcome to PULSE!", { description: "You're signed in." });
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
            {mode === "signup" && (
              <label className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-3 cursor-pointer">
                <Checkbox
                  checked={asOrganizer}
                  onCheckedChange={(v) => setAsOrganizer(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-medium block">I want to organize events</span>
                  <span className="text-muted-foreground text-xs">
                    Activates an organizer account so you can create and publish events.
                  </span>
                </span>
              </label>
            )}
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
