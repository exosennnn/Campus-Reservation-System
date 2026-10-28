export default function Navbar({
  user,
  bookingCount,
  theme,
  onToggleTheme,
  onOpenBookings,
  onOpenStaff,
  onSignOut,
}) {
  const isStaff = user?.role === 'admin';
  return (
    <header className="navbar">
      <div className="logo">
        <svg className="logo-mark" viewBox="0 0 24 16" aria-hidden="true">
          <path d="M2 1h20v4.5a2.5 2.5 0 0 0 0 5V15H2v-4.5a2.5 2.5 0 0 0 0-5Z" fill="currentColor" />
          <path d="M16 2.5v11" stroke="#14171f" strokeWidth="1.4" strokeDasharray="2 2" />
        </svg>
        <span>CampusEvents</span>
      </div>
      <div className="nav-controls">
        {user && (
          <span className="user-chip" title={user.name}>
            <span className="avatar" aria-hidden="true">{user.name.trim().charAt(0).toUpperCase()}</span>
            <span className="user-name">{user.name.split(' ')[0]}</span>
          </span>
        )}
        <button type="button" className="btn-nav theme-toggle" onClick={onToggleTheme}>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        {user && (
          <>
            {isStaff && (
              <button type="button" className="btn-nav" onClick={onOpenStaff}>
                Staff tools
              </button>
            )}
            <button type="button" className="btn-nav" onClick={onOpenBookings}>
              My bookings
              {bookingCount > 0 && <span className="count-badge">{bookingCount}</span>}
            </button>
            <button type="button" className="btn-nav" onClick={onSignOut}>
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
