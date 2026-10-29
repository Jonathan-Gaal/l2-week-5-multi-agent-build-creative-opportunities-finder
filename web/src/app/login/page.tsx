import LoginCard from "@/components/LoginCard";

export const metadata = { title: "Sign in | Artist Atlas" };

export default function Login() {
  return (
    <div className="wrap narrow auth-shell">
      <LoginCard />
    </div>
  );
}
