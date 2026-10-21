import os from "node:os";
import * as z from "zod";
import { createTrip } from "@/lib/db";

const Body = z.object({
  destination: z.string().trim().min(1).max(120),
  date: z.string().trim().min(1).max(40),
  hotelArea: z.string().trim().max(120).default(""),
  members: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        role: z.enum(["parent", "kid"]),
        age: z.coerce.number().int().min(0).max(120),
      }),
    )
    .min(2)
    .max(8),
});

// Addresses phones on the same Wi-Fi can use, since "localhost" only works on this computer.
function lanHosts(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Please fill in the destination, date and every member." }, { status: 400 });
  const names = parsed.data.members.map((m) => m.name.toLowerCase());
  if (new Set(names).size !== names.length) return Response.json({ error: "Each member needs a different name." }, { status: 400 });

  const slug = createTrip(parsed.data);
  return Response.json({ slug, lanHosts: lanHosts() });
}
