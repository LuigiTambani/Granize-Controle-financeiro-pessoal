import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

export type FinancialPdfTransaction = {
  type: "income" | "expense";
  description: string;
  amountCents: number;
  transactionDate: string;
  transactionTime: string;
  source: string;
};

export type FinancialPdfInput = {
  fullName: string;
  periodLabel: string;
  generatedAt: Date;
  incomeCents: number;
  expenseCents: number;
  transactions: FinancialPdfTransaction[];
  logoBytes?: Uint8Array;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const NAVY = rgb(0.035, 0.125, 0.2);
const GREEN = rgb(0.06, 0.79, 0.52);
const GREEN_DARK = rgb(0.02, 0.49, 0.34);
const RED = rgb(0.76, 0.22, 0.27);
const INK = rgb(0.05, 0.12, 0.18);
const MUTED = rgb(0.38, 0.45, 0.5);
const LINE = rgb(0.88, 0.91, 0.9);
const SURFACE = rgb(0.96, 0.98, 0.97);

function safeText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(cents || 0) / 100);
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const clean = safeText(text);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let shortened = clean;
  while (shortened.length > 1 && font.widthOfTextAtSize(`${shortened}...`, size) > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened.trimEnd()}...`;
}

function drawPageChrome(page: PDFPage, pageNumber: number, periodLabel: string, regular: PDFFont, bold: PDFFont, logo: PDFImage | null) {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 112, width: PAGE_WIDTH, height: 112, color: NAVY });
  if (logo) {
    const dimensions = logo.scaleToFit(145, 32);
    page.drawImage(logo, { x: MARGIN, y: PAGE_HEIGHT - 73, width: dimensions.width, height: dimensions.height });
  } else {
    page.drawText("GRANIZE", { x: MARGIN, y: PAGE_HEIGHT - 58, size: 16, font: bold, color: rgb(1, 1, 1) });
  }
  page.drawText(pageNumber === 1 ? "RESUMO FINANCEIRO" : "CONTINUAÇÃO DO RELATÓRIO", {
    x: MARGIN,
    y: PAGE_HEIGHT - 94,
    size: 8,
    font: bold,
    color: GREEN,
  });
  const period = safeText(periodLabel).toLocaleUpperCase("pt-BR");
  page.drawText(period, {
    x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(period, 9),
    y: PAGE_HEIGHT - 61,
    size: 9,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: PAGE_WIDTH - MARGIN, y: 34 }, thickness: 0.7, color: LINE });
  page.drawText("Granize - controle financeiro na palma da sua mão", { x: MARGIN, y: 20, size: 7.5, font: regular, color: MUTED });
  const number = `Página ${pageNumber}`;
  page.drawText(number, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(number, 7.5), y: 20, size: 7.5, font: regular, color: MUTED });
}

function drawTableHeader(page: PDFPage, y: number, bold: PDFFont) {
  page.drawRectangle({ x: MARGIN, y: y - 19, width: PAGE_WIDTH - MARGIN * 2, height: 25, color: SURFACE });
  const headings = [
    ["Data", MARGIN + 8],
    ["Hora", MARGIN + 72],
    ["Descrição", MARGIN + 117],
    ["Tipo", MARGIN + 358],
    ["Valor", MARGIN + 425],
  ] as const;
  for (const [label, x] of headings) page.drawText(label, { x, y: y - 10, size: 8, font: bold, color: INK });
  return y - 27;
}

export async function createFinancialPdf(input: FinancialPdfInput) {
  const document = await PDFDocument.create();
  document.setTitle(`Resumo financeiro - ${safeText(input.periodLabel)}`);
  document.setAuthor("Granize");
  document.setSubject("Resumo financeiro enviado pelo WhatsApp");
  document.setCreator("Granize");
  document.setProducer("Granize");
  document.setCreationDate(input.generatedAt);

  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = input.logoBytes ? await document.embedPng(input.logoBytes) : null;
  const totalBalance = input.incomeCents - input.expenseCents;
  let pageNumber = 1;
  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPageChrome(page, pageNumber, input.periodLabel, regular, bold, logo);

  page.drawText("Seu resumo do mês", { x: MARGIN, y: 684, size: 23, font: bold, color: INK });
  page.drawText(`Olá, ${fitText(input.fullName.split(" ")[0] || "cliente", regular, 9.5, 180)}. Este relatório foi preparado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(input.generatedAt)}.`, {
    x: MARGIN,
    y: 664,
    size: 9.5,
    font: regular,
    color: MUTED,
  });

  const cardWidth = 161;
  const summaries = [
    { label: "RECEITAS", value: money(input.incomeCents), color: GREEN_DARK },
    { label: "DESPESAS", value: money(input.expenseCents), color: RED },
    { label: "SALDO", value: money(totalBalance), color: totalBalance < 0 ? RED : NAVY },
  ];
  summaries.forEach((summary, index) => {
    const x = MARGIN + index * (cardWidth + 14);
    page.drawRectangle({ x, y: 584, width: cardWidth, height: 60, color: index === 2 ? rgb(0.92, 0.98, 0.96) : SURFACE, borderColor: LINE, borderWidth: 0.7 });
    page.drawText(summary.label, { x: x + 12, y: 625, size: 7, font: bold, color: MUTED });
    page.drawText(fitText(summary.value, bold, 15, cardWidth - 24), { x: x + 12, y: 600, size: 15, font: bold, color: summary.color });
  });

  page.drawText("Lançamentos do período", { x: MARGIN, y: 550, size: 14, font: bold, color: INK });
  page.drawText(`${input.transactions.length} ${input.transactions.length === 1 ? "lançamento" : "lançamentos"}`, { x: MARGIN, y: 535, size: 8.5, font: regular, color: MUTED });
  let y = drawTableHeader(page, 516, bold);

  if (input.transactions.length === 0) {
    page.drawText("Nenhum lançamento registrado neste período.", { x: MARGIN + 8, y: y - 18, size: 9, font: regular, color: MUTED });
  }

  for (const transaction of input.transactions) {
    if (y < 68) {
      pageNumber += 1;
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawPageChrome(page, pageNumber, input.periodLabel, regular, bold, logo);
      y = drawTableHeader(page, PAGE_HEIGHT - 142, bold);
    }
    const value = money(transaction.amountCents);
    const valueWidth = bold.widthOfTextAtSize(value, 8.5);
    page.drawText(dateLabel(transaction.transactionDate), { x: MARGIN + 8, y, size: 8, font: regular, color: INK });
    page.drawText(safeText(transaction.transactionTime || "--:--"), { x: MARGIN + 72, y, size: 8, font: regular, color: INK });
    page.drawText(fitText(transaction.description, regular, 8, 228), { x: MARGIN + 117, y, size: 8, font: regular, color: INK });
    page.drawText(transaction.type === "income" ? "Receita" : "Despesa", { x: MARGIN + 358, y, size: 8, font: regular, color: transaction.type === "income" ? GREEN_DARK : RED });
    page.drawText(value, { x: PAGE_WIDTH - MARGIN - 8 - valueWidth, y, size: 8.5, font: bold, color: transaction.type === "income" ? GREEN_DARK : RED });
    page.drawLine({ start: { x: MARGIN, y: y - 8 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 8 }, thickness: 0.45, color: LINE });
    y -= 25;
  }

  return document.save({ useObjectStreams: false });
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const base64 = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
