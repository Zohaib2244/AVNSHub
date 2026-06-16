import { Youtube, Linkedin, Bot, type LucideIcon } from "lucide-react";

export type QuickLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

// Add or remove entries here to change the quicklinks widget.
export const quickLinks: QuickLink[] = [
  { label: "youtube", href: "https://youtube.com", icon: Youtube },
  { label: "linkedin", href: "https://linkedin.com", icon: Linkedin },
  { label: "chatgpt", href: "https://chatgpt.com", icon: Bot },
];
