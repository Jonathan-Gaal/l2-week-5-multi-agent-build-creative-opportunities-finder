/** Sign up / Log in for the top bar. Visual only for now: there is no account system yet, so the buttons do nothing. */
export default function AuthButtons() {
  return (
    <div className="auth-slot">
      <button type="button" className="btn btn-ghost btn-small">
        Login
      </button>
      <button type="button" className="btn btn-small">
        Sign up
      </button>
    </div>
  );
}
