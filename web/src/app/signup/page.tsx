import LoginCard from "@/components/LoginCard";

export const metadata = { title: "Sign up | Artist Atlas" };

export default function Signup() {
  return (
    <div className="wrap">
      <LoginCard mode="signup" />
    </div>
  );
}
