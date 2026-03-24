import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("health_records")
    .select("*")
    .order("created_at", { ascending: false });

  return Response.json({ data, error });
}