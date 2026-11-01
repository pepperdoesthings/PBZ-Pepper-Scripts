import struct,sys,os,zlib
p=sys.argv[1]; out=sys.argv[2]
d=open(p,'rb').read()
f=d[-221:]
# find magic
i=d.rfind(struct.pack('<I',0x5A6F12E1))
ver,ioff,isz=struct.unpack('<IQQ',d[i+4:i+24])
print('ver',ver,'index',ioff,isz)
idx=d[ioff:ioff+isz]
o=0
def i32():
    global o; v=struct.unpack('<i',idx[o:o+4])[0]; o+=4; return v
def u64():
    global o; v=struct.unpack('<Q',idx[o:o+8])[0]; o+=8; return v
def fs():
    global o; n=i32()
    if n<0: s=idx[o:o+(-n)*2-2].decode('utf-16'); o+=-n*2
    else: s=idx[o:o+n-1].decode(); o+=n
    return s
mp=fs(); cnt=i32(); seed=u64(); print('mount',mp,'count',cnt)
hasph=i32()
if hasph: o+=8+8+20
hasfd=i32()
fdo=fdsz=0
if hasfd: fdo=u64(); fdsz=u64(); o+=20
esz=i32(); enc=idx[o:o+esz]; o+=esz
fd=d[fdo:fdo+fdsz]; 
idx=fd; o=0
nd=i32(); ents=[]
for _ in range(nd):
    dn=fs(); nf=i32()
    for _ in range(nf):
        fn=fs(); eo=i32(); ents.append((dn+fn,eo))
def dec(eo):
    b=struct.unpack('<I',enc[eo:eo+4])[0]; q=eo+4
    bc=(b>>6)&0xFFFF; cm=(b>>23)&0x3F
    if b&(1<<31): off=struct.unpack('<I',enc[q:q+4])[0]; q+=4
    else: off=struct.unpack('<Q',enc[q:q+8])[0]; q+=8
    if b&(1<<30): us=struct.unpack('<I',enc[q:q+4])[0]; q+=4
    else: us=struct.unpack('<Q',enc[q:q+8])[0]; q+=8
    if cm:
        if b&(1<<29): cs=struct.unpack('<I',enc[q:q+4])[0]; q+=4
        else: cs=struct.unpack('<Q',enc[q:q+8])[0]; q+=8
    else: cs=us
    blocks=[]
    if cm and bc>0:
        for _ in range(bc): blocks.append(struct.unpack('<I',enc[q:q+4])[0]); q+=4
    return off,us,cs,cm,blocks
for name,eo in ents:
    off,us,cs,cm,blocks=dec(eo)
    hdr=53 if not cm else 53+4+bc_len if False else None
    if cm==0:
        data=d[off+53:off+53+us]
    else:
        # header = 8*3+4+20+4+16*nblocks+1+4
        h=8+8+8+4+20+4+16*len(blocks)+1+4
        pos=off+h; data=b''
        for bs in blocks:
            data+=zlib.decompress(d[pos:pos+bs]); pos+=bs
    path=os.path.join(out,(mp+name).replace('../','').lstrip('/'))
    os.makedirs(os.path.dirname(path),exist_ok=True)
    open(path,'wb').write(data); print(name,us,cm)
