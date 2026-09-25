// Old saved questions have no typed answer schema. Infer only unambiguous controls.
export function questionInput(question:string):{type:'text'|'date'|'time';choices:string[]} {
 if(/hangi tarih|kaçıncı|hangi gün|ne zaman|tarihi ne|tarih.+(?:nedir|belli)/iu.test(question))return {type:'date',choices:[]};
 if(/saat kaç|hangi saat/iu.test(question))return {type:'time',choices:[]};
 if(/aynı (?:cephe|iş|proje)|doğru mu|onaylıyor musun/iu.test(question))return {type:'text',choices:['Evet','Hayır']};
 return {type:'text',choices:[]};
}
