# DevUnion Bewerbungswebsite

Statische Bewerbungswebsite für [DevUnion by Adam](https://github.com/DevUnion-by-Adam).

## Backend
- Supabase-Projekt: KDS-AI-v1
- Edge Function: `devunion-apply`
- Tabelle: `public.devunion_applications`
- Jede Bewerbung wird gespeichert, erzeugt einen Pull Request in `DevUnion-by-Adam/Contributing-LordLOLQDH` und sendet eine E-Mail an `adam_kraus@icloud.com`.

## Erforderliche Supabase Function Secrets
Vor dem Livebetrieb müssen diese Secrets im Supabase Dashboard unter Edge Functions → Secrets gesetzt werden:
- `GITHUB_TOKEN`: Fine-grained GitHub token mit Contents: Read and write und Pull requests: Read and write für `DevUnion-by-Adam/Contributing-LordLOLQDH`.
- `RESEND_API_KEY`: API-Key von Resend. Für produktive Zustellung muss die Absenderdomain bei Resend verifiziert sein. Der aktuelle Test-Absender ist `onboarding@resend.dev`; für eine eigene Domain den From-Wert in der Function entsprechend anpassen.

Supabase stellt `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` der Edge Function automatisch bereit. Niemals Service-Role-Keys im Frontend hinterlegen.
