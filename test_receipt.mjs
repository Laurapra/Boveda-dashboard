import { jsPDF } from "jspdf";
import fs from "fs";

const PAGE_W = 148, PAGE_H = 210, CENTER = PAGE_W/2;
const NAVY = [30,27,75], GRAY=[140,140,165], BG=[238,241,247], DOT=[205,207,224];

const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [PAGE_W, PAGE_H] });
doc.setFillColor(...BG); doc.rect(0,0,PAGE_W,PAGE_H,"F");
doc.setTextColor(...NAVY); doc.setFont("helvetica","bold"); doc.setFontSize(17);
doc.text("Comprobante de envío", CENTER, 22, {align:"center"});
doc.setFont("helvetica","normal"); doc.setFontSize(10.5);
doc.text("9 de ago, 11:52 a. m.", CENTER, 29, {align:"center"});
doc.setFont("helvetica","bold"); doc.setFontSize(29);
doc.text("$6.450,00 COP", CENTER, 43, {align:"center"});

const cardX=12, cardW=PAGE_W-cardX*2, cardY=56, padX=10;
const labelX=cardX+padX, valueRightX=cardX+cardW-padX;
const paraLinesFiltered = ["Stiff Andres Carrillo Molina","Bre-B","Nequi","@Stiff061"];
const senderName="Yira Calendaria Polo Gomez";
const estadoLbl="Completado";
const referencia="DISP-1786589217875";

const rowH=7.2, sectionGap=5, topPad=11, bottomPad=7;
const rowsCount = 1 + paraLinesFiltered.length + 2 + 1 + 1;
const gapsCount = 4;
const cardH = topPad+bottomPad+rowH*rowsCount+sectionGap*gapsCount;

doc.setFillColor(255,255,255);
doc.roundedRect(cardX,cardY,cardW,cardH,3,3,"F");

let y = cardY+topPad;
const drawLabel=(l,atY)=>{doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(...GRAY);doc.text(l,labelX,atY);};
const drawValue=(v,atY)=>{doc.setFont("helvetica","bold");doc.setFontSize(10.5);doc.setTextColor(...NAVY);doc.text(v,valueRightX,atY,{align:"right"});};
const drawDots=(atY)=>{doc.setDrawColor(...DOT);doc.setLineDashPattern([0.6,1],0);doc.line(labelX,atY,valueRightX,atY);doc.setLineDashPattern([],0);};

drawLabel("De",y); drawValue(senderName,y); y+=rowH;
drawDots(y-rowH/2+2); y+=sectionGap;

drawLabel("Para",y);
paraLinesFiltered.forEach((line,i)=>drawValue(line,y+rowH*i));
y+=rowH*paraLinesFiltered.length;
drawDots(y-rowH/2+2); y+=sectionGap;

drawLabel("Monto",y); drawValue("6.450,00",y); y+=rowH;
drawLabel("Moneda",y); drawValue("COP",y); y+=rowH;
drawDots(y-rowH/2+2); y+=sectionGap;

drawLabel("Estado",y); drawValue(estadoLbl,y); y+=rowH;
drawDots(y-rowH/2+2); y+=sectionGap;

drawLabel("Referencia",y); drawValue(referencia,y);

const logoY = cardY+cardH+16;
doc.setDrawColor(...NAVY);
doc.line(CENTER-6, logoY-8, CENTER-6, logoY+3);
doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.setTextColor(...NAVY);
doc.text("RAMPLIX", CENTER+2, logoY, {align:"left"});

doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...GRAY);
doc.text("Pago procesado por BE MOVIL", CENTER, logoY+14, {align:"center"});
doc.text("Este comprobante fue generado automáticamente por RAMPLIX", CENTER, logoY+19, {align:"center"});

fs.writeFileSync("/tmp/test_receipt.pdf", Buffer.from(doc.output("arraybuffer")));
console.log("done", cardH);
