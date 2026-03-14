export default {
  async fetch(request, env) {
    console.log("worker hit successfully");

    // Only allow POST requests
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Get the page the user came from
    const referer = request.headers.get("referer");
    if (!referer) return new Response("Referer missing", { status: 400 });

    const redirectUrl = new URL(referer);

    try {
      const formData = await request.formData();

      // 1. Honeypot Check FIRST — before doing anything else
      const honey = formData.get("_honey") || "";
      if (honey.length > 0) {
        console.log("Bot detected via honeypot.");
        redirectUrl.searchParams.set("form_submission_success", "true");
        return Response.redirect(redirectUrl.toString(), 302);
      }

      // 2. Parse Form Data
      const data = {
        parentName: formData.get("parent_name") || "N/A",
        childName: formData.get("child_name") || "N/A",
        childAge: formData.get("age") || "N/A",
        phoneNumber: formData.get("phone") || "N/A",
        email: formData.get("email") || "N/A",
        course: formData.get("course") || "N/A",
        message: formData.get("message") || "N/A",
      };

      // 3. Trigger Google Sheet Update
      const sheetPromise = fetch(env.GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      // 4. Prepare Email via Resend
      const emailPayload = {
        from: env.EMAIL_FROM, // e.g. "Contact Form <onboarding@resend.dev>"
        to: [env.EMAIL_TO], // e.g. "client@example.com"
        subject: `📬 New Enquiry Received – ${data.course}`,
        html: `
          <h3>New Enquiry Received</h3>
          <p><strong>Parent Name:</strong> ${data.parentName}</p>
          <p><strong>Child Name:</strong>  ${data.childName}</p>
          <p><strong>Child Age:</strong>   ${data.childAge}</p>
          <p><strong>Phone:</strong>       ${data.phoneNumber}</p>
          <p><strong>Email:</strong>       ${data.email}</p>
          <p><strong>Course:</strong>      ${data.course}</p>
          <p><strong>Message:</strong>     ${data.message}</p>
          <p>Sheet has been updated: <a href="${env.SHEET_LINK}" target="_blank">Enquiry Google Spreadsheet</a></p>
          <hr />
          <p><small>Submitted at: ${new Date().toISOString()}</small></p>
        `,
      };

      const resendPromise = fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify(emailPayload),
      });

      // 5. Wait for both Sheet + Email
      await Promise.all([sheetPromise, resendPromise]);

      // 6. Redirect to Thank You page
      redirectUrl.searchParams.set("form_submission_success", "true");
      redirectUrl.searchParams.set("message", "form submitted");
      return Response.redirect(redirectUrl.toString(), 302);
    } catch (err) {
      redirectUrl.searchParams.set("form_submission_success", "false");
      redirectUrl.searchParams.set("message", encodeURIComponent(err.message));
      return Response.redirect(redirectUrl.toString(), 302);
    }
  },
};
