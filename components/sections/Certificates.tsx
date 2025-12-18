"use client";

import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { trackExternalLink } from "@/lib/analytics";

interface Certificate {
  title: string;
  issuer: string;
  issueDate: string;
  credentialId?: string;
  credentialUrl?: string;
}

interface CertificatesProps {
  certificates: Certificate[];
  translations: {
    title: string;
    viewCredential: string;
  };
}

export function Certificates({
  certificates,
  translations,
}: CertificatesProps) {
  if (!certificates?.length) {
    return null;
  }

  return (
    <section className="container space-y-6 py-8 md:py-12 lg:py-24">
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
        <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
          {translations.title}
        </h2>
      </div>

      <div
        className={`mx-auto grid justify-center gap-4 ${
          certificates.length === 1
            ? "max-w-[24rem] grid-cols-1"
            : certificates.length === 2
              ? "grid-cols-1 sm:grid-cols-2 max-w-[48rem]"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-[64rem]"
        }`}
      >
        {certificates.map((cert) => (
          <Card
            key={`${cert.title}-${cert.issuer}`}
            className="flex flex-col hover:shadow-lg transition-shadow w-full"
          >
            <CardContent className="p-6 flex flex-col flex-1">
              <div className="flex-1">
                <h3 className="font-heading text-lg mb-2">{cert.title}</h3>
                <p className="text-sm text-muted-foreground mb-1">
                  {cert.issuer}
                </p>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {cert.issueDate}
                  </p>
                  {cert.credentialId && (
                    <p className="text-xs text-muted-foreground">
                      ID: {cert.credentialId}
                    </p>
                  )}
                </div>
              </div>
              {cert.credentialUrl && (
                <a
                  href={cert.credentialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/90 transition-colors mt-4"
                  onClick={() =>
                    trackExternalLink(
                      cert.credentialUrl!,
                      `Certificate: ${cert.title}`,
                    )
                  }
                >
                  {translations.viewCredential}
                  <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
