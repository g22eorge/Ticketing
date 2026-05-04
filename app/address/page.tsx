import { redirect } from "next/navigation";

export default function AddressRedirect() {
  const q = encodeURIComponent(
    "Eagle Info Solutions, Nalubega Complex 1st Floor, Shop L28, Bombo Road Opposite Watoto Church, Kampala",
  );
  redirect(`https://www.google.com/maps/search/?api=1&query=${q}`);
}
