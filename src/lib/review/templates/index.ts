import { nestedCommentsTemplate } from "./nestedComments";
import { quantityAdjustTemplate } from "./quantityAdjust";
import { statusToggleTemplate } from "./statusToggle";
import type { SeedTemplate } from "./types";

export const TEMPLATES: SeedTemplate[] = [
  statusToggleTemplate,
  nestedCommentsTemplate,
  quantityAdjustTemplate,
];

export function getTemplate(id: string): SeedTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

export function pickTemplate(id?: string | null): SeedTemplate {
  if (id) {
    const found = getTemplate(id);
    if (found) return found;
  }
  return TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
}

export function pickDefaultSkin(template: SeedTemplate) {
  const skins = template.defaultSkins;
  return skins[Math.floor(Math.random() * skins.length)];
}

export type { RenderedSeed, SeedTemplate, Skin } from "./types";
export { normalizeSkin } from "./types";
