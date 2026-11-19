const {toBuffer}=require('do-not-zip');

const xml=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function invalid(message){const error=new Error(message);error.codigo='ADMIN_REPORTE_INVALIDO';throw error;}
function columnName(index){let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;}
function cell(value,reference,style=0){
 if(value===null||value===undefined)return `<c r="${reference}" s="${style}"/>`;
 if(typeof value==='number'){
  if(!Number.isFinite(value))invalid('El reporte contiene un importe o cantidad no válido. Revisá los datos antes de exportar.');
  return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
 }
 const text=String(value);
 if(text.length>32767)invalid('El reporte contiene un texto que supera el límite por celda de Excel. Revisá las descripciones antes de exportar.');
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))invalid('El reporte contiene caracteres que Excel no admite. Revisá los textos antes de exportar.');
 // All user data is a literal string, never an Excel formula or external link.
 return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
}
function workbook(sheets){
 const files=[];
 sheets.forEach((sheet,index)=>{
  if(sheet.rows.length>1048575)invalid('El reporte supera el máximo de filas de Excel. Contactá con administración para dividir la exportación.');
  const last=columnName(sheet.columns.length-1)+(sheet.rows.length+1);
  const header=sheet.columns.map((col,i)=>cell(col.title,columnName(i)+'1',1)).join('');
  const rows=sheet.rows.map((row,i)=>`<row r="${i+2}">${sheet.columns.map((col,j)=>cell(row[j],columnName(j)+(i+2),col.money?2:col.wrap?3:0)).join('')}</row>`).join('');
  files.push({path:`xl/worksheets/sheet${index+1}.xml`,data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${sheet.columns.map((col,i)=>`<col min="${i+1}" max="${i+1}" width="${col.width||22}" customWidth="1"/>`).join('')}</cols><sheetData><row r="1" ht="32" customHeight="1">${header}</row>${rows}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`});
 });
 files.push({path:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`});
 files.push({path:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'});
 files.push({path:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet,i)=>`<sheet name="${xml(sheet.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`});
 files.push({path:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`});
 files.push({path:'xl/styles.xml',data:`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;CRC&quot; #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF14221E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`});
 return toBuffer(files.map(file=>({...file,data:Buffer.from(file.data,'utf8')})));
}
module.exports={workbook,columnName};
