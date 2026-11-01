import "@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "DispatcherDesk <support@dispatcherdesk.online>";

interface InvitationPayload {
  email: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
  expiresAt: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body: InvitationPayload = await req.json();

    if (!body.email || !body.organizationName || !body.role || !body.inviteUrl) {
      return Response.json(
        { error: "Missing required invitation fields." },
        { status: 400 }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return Response.json(
        { error: "RESEND_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const roleLabel = body.role.replace("_", " ");

    const html = `
      <!DOCTYPE html>
      <html>
        <body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#1f2937;">
          <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 2px 10px rgba(0,0,0,.06);">
            <h1 style="margin:0 0 8px;font-size:24px;color:#111827;">You're invited to DispatcherDesk</h1>

            <p style="font-size:16px;line-height:1.6;">
              You have been invited to join <strong>${escapeHtml(body.organizationName)}</strong>
              on DispatcherDesk as a <strong>${escapeHtml(roleLabel)}</strong>.
            </p>

            <div style="text-align:center;margin:32px 0;">
              <a href="${escapeHtml(body.inviteUrl)}"
                 style="display:inline-block;padding:14px 28px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
                Accept Invitation
              </a>
            </div>

            <p style="font-size:14px;line-height:1.6;color:#6b7280;">
              This invitation is valid for 7 days and can only be used once.
            </p>

            <p style="font-size:13px;line-height:1.5;color:#9ca3af;word-break:break-all;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              ${escapeHtml(body.inviteUrl)}
            </p>

            <hr style="border:0;border-top:1px solid #e5e7eb;margin:32px 0;">

            <p style="font-size:12px;color:#9ca3af;text-align:center;">
              DispatcherDesk � Smart Dispatch. Faster Operations. Better Control.
            </p>
          </div>
        </body>
      </html>
    `;

    const resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [body.email],
        subject: `You're invited to ${body.organizationName} on DispatcherDesk`,
        html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API error:", resendData);

      return Response.json(
        {
          error: "Failed to send invitation email.",
          details: resendData,
        },
        { status: 502 }
      );
    }

    return Response.json({
      success: true,
      messageId: resendData.id,
    });
  } catch (error) {
    console.error("Invitation email error:", error);

    return Response.json(
      { error: "Invalid request or email delivery error." },
      { status: 500 }
    );
  }
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

