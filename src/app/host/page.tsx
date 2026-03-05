import { cookies } from "next/headers";
import { HostConsole } from "@/components/host/host-console";
import { HostLoginForm } from "@/components/host/host-login-form";
import { HOST_SESSION_COOKIE_NAME, isHostSessionTokenValid } from "@/lib/server/host-auth";

export const dynamic = "force-dynamic";

export default function HostPage() {
  const token = cookies().get(HOST_SESSION_COOKIE_NAME)?.value;
  const authenticated = isHostSessionTokenValid(token);
  return authenticated ? <HostConsole /> : <HostLoginForm />;
}
