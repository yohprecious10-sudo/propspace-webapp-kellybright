import { useState, useEffect } from 'react';
import { Sparkles, LayoutGrid, Heart, Eye, ArrowRight, ShieldCheck, Home } from 'lucide-react';
import { User, Property } from './types';
import { Navbar } from './components/Navbar';
import { FilterSidebar } from './components/FilterSidebar';
import { PropertyCard } from './components/PropertyCard';
import { PropertyForm } from './components/PropertyForm';
import { Dashboard } from './components/Dashboard';
import { AuthModal } from './components/AuthModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [activeView, setActiveView] = useState<'home' | 'dashboard' | 'add-property' | 'edit-property'>('home');
  const [selectedPropertyForEdit, setSelectedPropertyForEdit] = useState<Property | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Filters State
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // UX loadings & errors
  const [loading, setLoading] = useState(true);
  const [errorMess, setErrorMess] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // On initial mount, extract user token details
  useEffect(() => {
    const storedToken = localStorage.getItem('propspace_token');
    const storedUser = localStorage.getItem('propspace_user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (err) {
        localStorage.removeItem('propspace_token');
        localStorage.removeItem('propspace_user');
      }
    }
    fetchPropertiesFeed();
  }, []);

  // Filter application trigger
  useEffect(() => {
    let result = [...properties];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p => 
        p.title.toLowerCase().includes(q) || 
        p.description.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q)
      );
    }

    if (city.trim()) {
      result = result.filter(p => p.city.toLowerCase() === city.toLowerCase().trim());
    }

    if (country.trim()) {
      result = result.filter(p => p.country.toLowerCase() === country.toLowerCase().trim());
    }

    if (propertyType) {
      result = result.filter(p => p.propertyType === propertyType);
    }

    if (minPrice) {
      result = result.filter(p => p.price >= Number(minPrice));
    }

    if (maxPrice) {
      result = result.filter(p => p.price <= Number(maxPrice));
    }

    setFilteredProperties(result);
  }, [properties, search, city, country, propertyType, minPrice, maxPrice]);

  const fetchPropertiesFeed = async () => {
    setLoading(true);
    setErrorMess('');
    try {
      const res = await fetch('/api/properties');
      if (!res.ok) {
        throw new Error('Failed to fetch property listings feed.');
      }
      const data = await res.json();
      setProperties(data.properties || []);
    } catch (err: any) {
      setErrorMess(err.message || 'Server connection details failed.');
    } finally {
      setLoading(false);
    }
  };

  // Auth helper
  const handleAuthSuccess = (newToken: string, user: User) => {
    setToken(newToken);
    setCurrentUser(user);
    localStorage.setItem('propspace_token', newToken);
    localStorage.setItem('propspace_user', JSON.stringify(user));
    fetchPropertiesFeed(); // Reload properties lists
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    localStorage.removeItem('propspace_token');
    localStorage.removeItem('propspace_user');
    setActiveView('home');
  };

  // Profile Edit
  const handleUpdateProfile = async (name: string, phone: string, avatarUrl: string) => {
    if (!token) return;
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, phone, avatarUrl })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update profile.');
    }

    // Refresh user state
    setCurrentUser(data.user);
    localStorage.setItem('propspace_user', JSON.stringify(data.user));
    fetchPropertiesFeed(); // Update in-memory creator details
  };

  // Change Password
  const handleUpdatePassword = async (currentPassword: string, newPassword: string) => {
    if (!token) return;
    const res = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update user security password.');
    }
  };

  // CRUD operations
  const handleCreatePropertySubmit = async (formData: any) => {
    if (!token) {
      setIsAuthOpen(true);
      return;
    }
    setFormSubmitting(true);
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to list property.');
      }

      await fetchPropertiesFeed();
      setActiveView('home');
    } catch (err: any) {
      alert(err.message || 'Error occurred listing property.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditPropertySubmit = async (formData: any) => {
    if (!token || !selectedPropertyForEdit) return;
    setFormSubmitting(true);
    try {
      const res = await fetch(`/api/properties/${selectedPropertyForEdit.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to edit property.');
      }

      await fetchPropertiesFeed();
      setActiveView('home');
      setSelectedPropertyForEdit(null);
    } catch (err: any) {
      alert(err.message || 'Error occurred updating property details.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete property.');
      }

      await fetchPropertiesFeed();
    } catch (err: any) {
      alert(err.message || 'Error deleting property.');
    }
  };

  // Navigation Guard / helper
  const handleNavigate = (view: 'home' | 'dashboard' | 'my-listings' | 'add-property') => {
    if (view === 'home') {
      setActiveView('home');
      return;
    }

    // Require Auth for Dashboard / Adding listings
    if (!currentUser) {
      setIsAuthOpen(true);
      return;
    }

    if (view === 'dashboard' || view === 'my-listings') {
      setActiveView('dashboard');
    } else if (view === 'add-property') {
      setSelectedPropertyForEdit(null);
      setActiveView('add-property');
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setCity('');
    setCountry('');
    setPropertyType('');
    setMinPrice('');
    setMaxPrice('');
  };

  const myProperties = currentUser 
    ? properties.filter(p => p.ownerId === currentUser.id)
    : [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-emerald-500 selection:text-white" id="main-app-container">
      {/* Dynamic Nav */}
      <Navbar
        currentUser={currentUser}
        onNavigate={handleNavigate}
        activeView={activeView}
        onLogout={handleLogout}
        onOpenLoginModal={() => setIsAuthOpen(true)}
      />

      {/* Main Container Workspace */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* VIEW 1: HOME FEED LIST */}
        {activeView === 'home' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8" id="home-view-grid">
            {/* Filter Sidebar Left Col */}
            <div className="lg:col-span-1">
              <FilterSidebar
                search={search}
                setSearch={setSearch}
                city={city}
                setCity={setCity}
                country={country}
                setCountry={setCountry}
                propertyType={propertyType}
                setPropertyType={setPropertyType}
                minPrice={minPrice}
                setMinPrice={setMinPrice}
                maxPrice={maxPrice}
                setMaxPrice={setMaxPrice}
                onClearFilters={handleClearFilters}
              />
            </div>

            {/* List Right Col */}
            <div className="lg:col-span-3 flex flex-col gap-6" id="properties-results-area">
              {/* Heading Banner */}
              <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden flex flex-col gap-3 shadow-md">
                <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
                <div className="absolute -left-10 -top-10 w-44 h-44 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
                
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full self-start leading-none">
                  Live Properties
                </span>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight max-w-xl">
                  Discover Your Perfect Listing in Cameroon & Across the World
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 max-w-lg leading-relaxed">
                  Real-time listing portal featuring secure profile updates, dynamic multi-image slideshows, price standardizations, and direct client agent contact details.
                </p>
              </div>

              {/* Feed loaders, errors, items list */}
              {loading ? (
                <div className="py-24 flex flex-col items-center justify-center gap-3 bg-white rounded-3xl border border-slate-100 shadow-sm" id="feed-loader">
                  <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-bold text-slate-500">Loading catalog properties...</span>
                </div>
              ) : errorMess ? (
                <div className="py-20 text-center bg-white rounded-3xl border border-rose-100 p-6 shadow-sm flex flex-col items-center gap-3" id="feed-error">
                  <span className="text-3xl">⚠️</span>
                  <p className="text-rose-800 font-bold text-sm tracking-wide">{errorMess}</p>
                  <button onClick={fetchPropertiesFeed} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition duration-150">
                    Retry Connection
                  </button>
                </div>
              ) : filteredProperties.length === 0 ? (
                <div className="py-20 text-center bg-white rounded-3xl border border-slate-100 p-8 shadow-sm flex flex-col items-center gap-2" id="feed-empty">
                  <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-2">
                    <Home className="w-8 h-8" />
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">No Properties Match with Filters</h3>
                  <p className="text-slate-400 text-xs sm:text-sm max-w-xs leading-relaxed">
                    Try clearing country locations, pricing limits, or search terms to browse the entire available catalog.
                  </p>
                  <button onClick={handleClearFilters} className="mt-3 px-5 py-2 hover:bg-slate-800 bg-slate-900 text-white font-bold rounded-xl text-xs transition duration-150 shadow-sm">
                    Reset Filter Forms
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6" id="properties-cards-grid">
                  {filteredProperties.map((property) => (
                    <PropertyCard
                      key={property.id}
                      property={property}
                      currentUserId={currentUser?.id}
                      onEdit={(prop) => { setSelectedPropertyForEdit(prop); setActiveView('edit-property'); }}
                      onDelete={handleDeleteProperty}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: DASHBOARD */}
        {activeView === 'dashboard' && currentUser && (
          <div className="max-w-4xl mx-auto" id="dashboard-view-container">
            <Dashboard
              currentUser={currentUser}
              onUpdateProfile={handleUpdateProfile}
              onUpdatePassword={handleUpdatePassword}
              myProperties={myProperties}
              onEditProperty={(prop) => { setSelectedPropertyForEdit(prop); setActiveView('edit-property'); }}
              onDeleteProperty={handleDeleteProperty}
              onNavigateHome={() => setActiveView('home')}
            />
          </div>
        )}

        {/* VIEW 3: ADD PROPERTY */}
        {activeView === 'add-property' && (
          <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-md" id="add-property-view">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mb-1 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-emerald-600" />
              List New Property Details
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mb-6 border-b border-slate-50 pb-4">
              Enter specific descriptions, locations, custom prices, and upload files to showcase your listings in style.
            </p>
            <PropertyForm
              onSubmit={handleCreatePropertySubmit}
              onCancel={() => setActiveView('home')}
              isSubmitting={formSubmitting}
            />
          </div>
        )}

        {/* VIEW 4: EDIT PROPERTY */}
        {activeView === 'edit-property' && selectedPropertyForEdit && (
          <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-md" id="edit-property-view">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mb-1 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-emerald-650 text-emerald-500" />
              Edit Property Listing Properties
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mb-6 border-b border-slate-50 pb-4">
              Update information, add modern photo URLs or upload additional picture files securely.
            </p>
            <PropertyForm
              initialProperty={selectedPropertyForEdit}
              onSubmit={handleEditPropertySubmit}
              onCancel={() => { setActiveView('home'); setSelectedPropertyForEdit(null); }}
              isSubmitting={formSubmitting}
            />
          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-slate-900 border-t border-slate-800 py-8 text-slate-400 mt-auto text-xs" id="footer-panel">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-emerald-600 flex items-center justify-center font-bold text-white text-xs">
              P
            </div>
            <span className="font-extrabold text-slate-200 text-sm">PropSpace</span>
          </div>
          <p className="text-center sm:text-left text-slate-500 font-medium">
            © 2026 PropSpace Real Estate Portal. Full-Stack Secure Hashing & JWT Powered.
          </p>
          <div className="flex gap-4 text-slate-500 font-bold">
            <span id="footer-ver-tag" className="flex items-center gap-1 hover:text-emerald-500 transition duration-150">
              <ShieldCheck className="w-3.5 h-3.5" />
              Secure Encrypted
            </span>
          </div>
        </div>
      </footer>

      {/* AUTH POPUP DIALOG MODAL */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}
