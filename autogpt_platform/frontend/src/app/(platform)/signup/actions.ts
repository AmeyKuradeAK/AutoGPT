"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import getServerSupabase from "@/lib/supabase/getServerSupabase";
import { signupFormSchema } from "@/types/auth";
import BackendAPI from "@/lib/autogpt-server-api";
import { verifyTurnstileToken } from "@/lib/turnstile";

export async function signup(
  values: z.infer<typeof signupFormSchema>,
  turnstileToken: string,
) {
  "use server";
  return await Sentry.withServerActionInstrumentation(
    "signup",
    {},
    async () => {
      const supabase = await getServerSupabase();

      if (!supabase) {
        redirect("/error");
      }

      // Verify Turnstile token if provided
      const success = await verifyTurnstileToken(turnstileToken, "signup");
      if (!success) {
        return "CAPTCHA verification failed. Please try again.";
      }

      // We are sure that the values are of the correct type because zod validates the form
      const { data, error } = await supabase.auth.signUp(values);

      if (error) {
        console.error("Error signing up", error);
        // FIXME: supabase doesn't return the correct error message for this case
        if (error.message.includes("P0001")) {
          return "not_allowed";
        }
        if (error.code === "user_already_exists") {
          return "user_already_exists";
        }
        return error.message;
      }

      if (data.session) {
        await supabase.auth.setSession(data.session);
      }
      // Don't onboard if disabled
      if (await new BackendAPI().isOnboardingEnabled()) {
        revalidatePath("/onboarding", "layout");
        redirect("/onboarding");
      }
      revalidatePath("/", "layout");
      redirect("/");
    },
  );
}
