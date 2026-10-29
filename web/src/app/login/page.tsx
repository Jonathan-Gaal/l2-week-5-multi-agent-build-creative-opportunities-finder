import LoginCard from "@/components/LoginCard";

export const metadata = { title: "Login | Artist Atlas" };

export default function Login() {
  return (
    <div className="wrap">
      <LoginCard mode="signin" />
    </div>
  );
}
