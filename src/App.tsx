import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import EventsCatalog from "./pages/EventsCatalog";
import EventDetail from "./pages/EventDetail";
import OrganizerDashboard from "./pages/OrganizerDashboard";
import EventEditor from "./pages/EventEditor";
import TicketTiers from "./pages/TicketTiers";
import OrganizerApprovals from "./pages/OrganizerApprovals";
import AdminDashboard from "./pages/AdminDashboard";
import AdminApprovals from "./pages/AdminApprovals";
import AdminTaxonomy from "./pages/AdminTaxonomy";
import MyTickets from "./pages/MyTickets";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <CartProvider>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/events" element={<EventsCatalog />} />
                  <Route path="/events/:slug" element={<EventDetail />} />
                  <Route path="/tickets" element={<ProtectedRoute><MyTickets /></ProtectedRoute>} />

                  <Route path="/organizer" element={<ProtectedRoute><OrganizerDashboard /></ProtectedRoute>} />
                  <Route path="/organizer/events/new" element={<ProtectedRoute requireRole="organizer"><EventEditor /></ProtectedRoute>} />
                  <Route path="/organizer/events/:id" element={<ProtectedRoute requireRole="organizer"><EventEditor /></ProtectedRoute>} />
                  <Route path="/organizer/events/:id/tiers" element={<ProtectedRoute requireRole="organizer"><TicketTiers /></ProtectedRoute>} />
                  <Route path="/organizer/approvals" element={<ProtectedRoute requireRole="organizer"><OrganizerApprovals /></ProtectedRoute>} />

                  <Route path="/admin" element={<ProtectedRoute requireRole="admin"><AdminDashboard /></ProtectedRoute>} />
                  <Route path="/admin/approvals" element={<ProtectedRoute requireRole="admin"><AdminApprovals /></ProtectedRoute>} />
                  <Route path="/admin/taxonomy" element={<ProtectedRoute requireRole="admin"><AdminTaxonomy /></ProtectedRoute>} />

                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </CartProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
