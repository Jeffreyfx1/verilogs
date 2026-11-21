/** Visible-area math for Vera. Height comes from the visual viewport, not 100vh. */

export type VeraFrameInput = {
  layoutHeight: number;
  visibleHeight: number;
  offsetTop: number;
  width: number;
  phone?: boolean;
  navGap?: number;
};

export type VeraFrame = {
  phone: boolean;
  keyboard: boolean;
  dockBottom: number | null;
  panelHeight: number;
  panelWidth: number;
};

export function veraFrame(input: VeraFrameInput): VeraFrame {
  const layoutHeight = Math.max(1, Math.round(input.layoutHeight));
  const visibleHeight = Math.max(1, Math.round(input.visibleHeight));
  const offsetTop = Math.max(0, Math.round(input.offsetTop || 0));
  const width = Math.max(1, Math.round(input.width));
  const phone = input.phone ?? (width < 768 || layoutHeight < 520);
  const keyboardInset = Math.max(0, layoutHeight - visibleHeight - offsetTop);
  const keyboard = keyboardInset > 80;
  const fab = keyboard ? 0 : 62;
  const restingGap = input.navGap ?? (phone ? 84 : 12);
  const topGap = 8;
  const available = Math.max(200, visibleHeight - (keyboard ? 8 : restingGap + topGap) - fab);
  const target = phone ? (keyboard ? available : Math.round(visibleHeight * 0.68)) : 544;
  const panelHeight = Math.min(target, available);
  const panelWidth = phone ? Math.max(240, width - 16) : 376;
  return {
    phone,
    keyboard,
    dockBottom: keyboard ? keyboardInset + 4 : phone ? restingGap : null,
    panelHeight,
    panelWidth,
  };
}
