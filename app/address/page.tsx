import { redirect } from "next/navigation";

export default function AddressRedirect() {
  const address = process.env.NEXT_PUBLIC_COMPANY_ADDRESS;
  if (address) {
    const q = encodeURIComponent(address);
    redirect(`https://www.google.com/maps/search/?api=1&query=${q}`);
  }
  redirect("/");
}
