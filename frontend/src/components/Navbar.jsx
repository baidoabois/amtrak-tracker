import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="bg-amtrak-blue text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <span className="text-amtrak-red text-2xl">🚆</span>
          Amtrak Tracker
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <a href="/board" className="hover:text-blue-200 transition-colors">Live Board</a>
          <Link to="/schedule" className="hover:text-blue-200 transition-colors">Search</Link>

          {user ? (
            <>
              <Link to="/dashboard" className="hover:text-blue-200 transition-colors">
                My Trains
              </Link>
              {user.role === 'admin' && (
                <Link to="/admin" className="hover:text-blue-200 transition-colors">
                  Admin
                </Link>
              )}
              <span className="text-blue-300">|</span>
              <span className="text-blue-200">{user.name}</span>
              <button
                onClick={handleLogout}
                className="bg-amtrak-red hover:bg-red-700 px-3 py-1 rounded transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="hover:text-blue-200 transition-colors">Sign In</Link>
              <Link
                to="/register"
                className="bg-amtrak-red hover:bg-red-700 px-3 py-1 rounded transition-colors"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
