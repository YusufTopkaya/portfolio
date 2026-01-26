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
    <section className="container space-y-8 py-12 md:py-16 lg:py-24">
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
        <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl text-gradient">
          {translations.title}
        </h2>
      </div>

      <div
        className={`mx-auto grid justify-center gap-6 ${
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
            className="flex flex-col w-full group"
          >
            <CardContent className="p-6 flex flex-col flex-1">
              <div className="flex-1">
                <h3 className="font-heading text-lg mb-2 group-hover:text-primary transition-colors">
                  {cert.credentialUrl ? (
                    <a
                      href={cert.credentialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        trackExternalLink(
                          cert.credentialUrl!,
                          `Certificate: ${cert.title}`,
                        )
                      }
                    >
                      {cert.title}
                    </a>
                  ) : (
                    cert.title
                  )}
                </h3>
                <p className="text-sm text-muted-foreground mb-1">
                  {cert.issuer}
                </p>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {cert.issueDate}
                  </p>
                  {cert.credentialId && (
                    <p className="text-xs text-muted-foreground glass-subtle rounded-full px-2 py-0.5">
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
                  className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-all duration-200 mt-4 group"
                  onClick={() =>
                    trackExternalLink(
                      cert.credentialUrl!,
                      `Certificate: ${cert.title}`,
                    )
                  }
                >
                  {translations.viewCredential}
                  <ExternalLink className="h-4 w-4 ml-2 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
