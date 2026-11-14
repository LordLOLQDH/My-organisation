import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const b64 = (value: string) => btoa(unescape(encodeURIComponent(value)));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    if (clean(body.website, 200)) return json({ ok: true });
    const application = {
      full_name: clean(body.full_name, 100),
      github_username: clean(body.github_username, 39).replace(/^@/, ""),
      email: clean(body.email, 254).toLowerCase(),
      skills: clean(body.skills, 1500),
      motivation: clean(body.motivation, 4000),
      experience: clean(body.experience, 2000),
      project_links: clean(body.project_links, 1500)
    };
    if (application.full_name.length < 2 || !/^[a-zA-Z0-9-]{1,39}$/.test(application.github_username) ||
        !validEmail(application.email) || application.skills.length < 2 ||
        application.motivation.length < 10 || application.experience.length < 2) {
      return json({ error: "Bitte prüfe deine Angaben. Einige Felder fehlen oder sind ungültig." }, 400);
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: saved, error: insertError } = await supabase.from("devunion_applications")
      .insert(application).select("id").single();
    if (insertError) throw new Error("Speichern fehlgeschlagen: " + insertError.message);

    let prUrl: string | null = null;
    let prError: string | null = null;
    const ghToken = Deno.env.get("GITHUB_TOKEN");
    if (ghToken) {
      try {
        const repo = "DevUnion-by-Adam/Contributing-LordLOLQDH";
        const api = "https://api.github.com/repos/" + repo;
        const headers = { "Authorization": "Bearer " + ghToken, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
        const baseResponse = await fetch(api + "/git/ref/heads/main", { headers });
        if (!baseResponse.ok) throw new Error("GitHub main branch konnte nicht gelesen werden: " + await baseResponse.text());
        const baseData = await baseResponse.json();
        const branch = "application/" + saved.id;
        const refResponse = await fetch(api + "/git/refs", { method: "POST", headers, body: JSON.stringify({ ref: "refs/heads/" + branch, sha: baseData.object.sha }) });
        if (!refResponse.ok) throw new Error("GitHub Branch konnte nicht erstellt werden: " + await refResponse.text());
        const md = [
          "# Neue DevUnion-Bewerbung",
          "",
          "GitHub: https://github.com/" + application.github_username,
          "",
          "Die vollständigen Bewerbungsangaben werden aus Datenschutzgründen nicht im öffentlichen Repository veröffentlicht.",
          "Interne Bewerbungs-ID: " + saved.id
        ].join("\\n");
        const fileResponse = await fetch(api + "/contents/applications/" + saved.id + ".md", {
          method: "PUT", headers,
          body: JSON.stringify({ message: "Bewerbung von " + application.github_username, content: b64(md), branch })
        });
        if (!fileResponse.ok) throw new Error("Bewerbungsdatei konnte nicht erstellt werden: " + await fileResponse.text());
        const prResponse = await fetch(api + "/pulls", {
          method: "POST", headers,
          body: JSON.stringify({
            title: "Bewerbung: " + application.github_username,
            head: branch, base: "main",
            body: "Neue Bewerbung über die DevUnion-Website.\n\n**Name:** " + application.full_name +
              "\n**GitHub:** @" + application.github_username +
              "\n\nBitte die Bewerbungsdetails in `applications/" + saved.id + ".md` prüfen.\n\nBewerbungs-ID: " + saved.id
          })
        });
        const prData = await prResponse.json();
        if (!prResponse.ok) throw new Error("Pull Request konnte nicht erstellt werden: " + JSON.stringify(prData));
        prUrl = prData.html_url;
        await supabase.from("devunion_applications").update({ status: "pr_created", github_pr_url: prUrl }).eq("id", saved.id);
      } catch (error) {
        prError = error instanceof Error ? error.message : String(error);
      }
    } else {
      prError = "GITHUB_TOKEN fehlt in den Supabase Function Secrets.";
    }

    let emailSent = false;
    let emailError: string | null = null;
    const emailText = [
      "Neue DevUnion-Bewerbung",
      "",
      "Name: " + application.full_name,
      "GitHub: https://github.com/" + application.github_username,
      "E-Mail: " + application.email,
      "",
      "Fähigkeiten:",
      application.skills,
      "",
      "Motivation:",
      application.motivation,
      "",
      "Erfahrung:",
      application.experience,
      "",
      "Projektlinks:",
      application.project_links || "Keine angegeben",
      "",
      "Pull Request: " + (prUrl || "Nicht erstellt"),
      "Bewerbungs-ID: " + saved.id
    ].join("\n");
    try {
      const mailResponse = await fetch("https://formsubmit.co/ajax/adam_kraus@icloud.com", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          name: application.full_name,
          email: application.email,
          _replyto: application.email,
          _subject: "Neue DevUnion-Bewerbung: " + application.github_username,
          _template: "table",
          message: emailText
        })
      });
      const mailData = await mailResponse.json().catch(() => ({}));
      emailSent = mailResponse.ok && String(mailData.success) === "true";
      if (!emailSent) {
        emailError = mailData.message || JSON.stringify(mailData) || "FormSubmit hat die E-Mail nicht bestätigt.";
        console.error("FormSubmit error:", emailError);
      }
    } catch (error) {
      emailError = error instanceof Error ? error.message : String(error);
      console.error("FormSubmit request failed:", emailError);
    }

    await supabase.from("devunion_applications").update({
      status: prUrl && emailSent ? "completed" : prUrl ? "pr_created" : "received",
      email_sent: emailSent
    }).eq("id", saved.id);
    return json({ ok: true, application_id: saved.id, pull_request: prUrl, email_sent: emailSent, setup_required: !ghToken, pull_request_error: prError, email_error: emailError });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Interner Fehler" }, 500);
  }
});
