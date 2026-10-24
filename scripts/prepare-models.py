"""Repack an existing local Human Atlas download, keeping source identities.
Input: /tmp/atlas.json and /tmp/anatomy-source/body-{0..14}.bin.
Source: ashemag/human-atlas; anatomy data: BodyParts3D CC BY 4.0.
"""
import json,pathlib,gzip,struct
root=pathlib.Path(__file__).resolve().parent.parent
atlas=json.load(open('/tmp/atlas.json'));brain=set(next(c['elements'] for c in atlas['concepts'] if c['name']=='brain'))
source=[pathlib.Path(f'/tmp/anatomy-source/body-{i}.bin').read_bytes() for i in range(len(atlas['chunks']))]
parts=[];layers=[]
for layer in ['skeletal','muscular','organs','arterial','venous','nervous','sensory','connective','reproductive','integumentary']:
 buf=bytearray()
 for p in atlas['parts']:
  category='organs' if p['system'] in ['cardiac','respiratory','digestive','urinary','endocrine','lymphatic'] or p['id'] in brain or p['name'].startswith('Hepatovenous segment') else p['system']
  if category!=layer:continue
  out={k:v for k,v in p.items() if k not in ['positions','normals','indices','chunk']};out['layer']=layer
  if p['id'] in brain:out['color']='#d4bca4'
  if p['name'].startswith('Hepatovenous segment') or p['name']=='Caudate lobe of liver':out['color']='#ab7d67'
  for name,size in [('positions',p['vertexCount']*12),('normals',p['vertexCount']*6),('indices',p['indexCount']*4)]:
   while len(buf)%4:buf.append(0)
   out[name]=len(buf);buf.extend(source[p['chunk']][p[name]:p[name]+size])
  parts.append(out)
 path=root/'public'/'models'/f'{layer}.bin.gz';path.write_bytes(gzip.compress(bytes(buf),compresslevel=9,mtime=0))
 layers.append({'id':layer,'url':f'models/{layer}.bin.gz','bytes':len(buf),'compressedBytes':path.stat().st_size,'parts':sum(p['layer']==layer for p in parts)})
 print(layer,len(buf),'compressed',path.stat().st_size)
ids={p['id'] for p in parts};concepts=[{**c,'elements':[x for x in c['elements'] if x in ids]} for c in atlas['concepts'] if any(x in ids for x in c['elements'])]
(root/'public'/'models'/'atlas.json').write_text(json.dumps({'version':atlas['version'],'parts':parts,'layers':layers,'concepts':concepts},ensure_ascii=False,separators=(',',':')))
