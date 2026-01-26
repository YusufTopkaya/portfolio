import { getProfile } from "@/lib/i18n/server-content-loader";
import { translations } from "@/lib/i18n/translations";
import { FloatingActionMenu } from "./FloatingActionMenu";

interface ContactMenuWrapperProps {
  lang: string;
}

export async function ContactMenuWrapper({ lang }: ContactMenuWrapperProps) {
  const profile = await getProfile(lang);
  const t = translations[lang] || translations.en;

  return (
    <FloatingActionMenu
      email={profile.personalInfo.email}
      phoneNumber={profile.personalInfo.phoneNumber}
      translations={t.contact}
    />
  );
}
