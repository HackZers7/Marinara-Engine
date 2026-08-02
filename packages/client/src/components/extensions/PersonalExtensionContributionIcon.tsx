import {
  Bot,
  BookOpen,
  Database,
  Gamepad2,
  Heart,
  Image,
  MessageSquareText,
  Music,
  Puzzle,
  Settings,
  Sparkles,
  Star,
  WandSparkles,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { PersonalExtensionContributionIcon } from "@marinara-engine/shared";

const CONTRIBUTION_ICONS: Record<PersonalExtensionContributionIcon, LucideIcon> = {
  bot: Bot,
  book: BookOpen,
  database: Database,
  gamepad: Gamepad2,
  heart: Heart,
  image: Image,
  message: MessageSquareText,
  music: Music,
  puzzle: Puzzle,
  settings: Settings,
  sparkles: Sparkles,
  star: Star,
  tool: Wrench,
  wand: WandSparkles,
  zap: Zap,
};

export function PersonalExtensionContributionIcon({
  icon = "puzzle",
  size = "0.875rem",
  className,
}: {
  icon?: PersonalExtensionContributionIcon;
  size?: string | number;
  className?: string;
}) {
  const Icon = CONTRIBUTION_ICONS[icon] ?? Puzzle;
  return <Icon aria-hidden="true" className={className} size={size} />;
}
