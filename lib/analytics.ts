declare global {
  interface Window {
    gtag?: (
      command: string,
      targetId: string,
      config?: Record<string, unknown>,
    ) => void;
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export const trackEvent = (
  eventName: string,
  eventParams?: Record<string, unknown>,
) => {
  if (typeof window !== "undefined") {
    if (window.gtag) {
      window.gtag("event", eventName, eventParams);
    }

    if (window.dataLayer) {
      window.dataLayer.push({
        event: eventName,
        ...eventParams,
      });
    }
  }
};

export const trackCVDownload = (language?: string) => {
  trackEvent("cv_download", {
    event_category: "engagement",
    event_label: language || "unknown",
    value: 1,
  });
};

export const trackFileDownload = (fileName: string, fileType?: string) => {
  trackEvent("file_download", {
    event_category: "engagement",
    event_label: fileName,
    file_type: fileType,
    value: 1,
  });
};

export const trackButtonClick = (buttonName: string, location?: string) => {
  trackEvent("button_click", {
    event_category: "interaction",
    event_label: buttonName,
    page_location: location,
  });
};

export const trackExternalLink = (url: string, linkText?: string) => {
  trackEvent("external_link_click", {
    event_category: "outbound",
    event_label: linkText || url,
    link_url: url,
  });
};
