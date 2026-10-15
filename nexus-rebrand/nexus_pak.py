import struct, gzip, io
def read_pak(path):
    d=open(path,'rb').read()
    ver=struct.unpack_from('<I',d,0)[0]
    assert ver==5, ver
    enc=d[4]
    n,aliases=struct.unpack_from('<HH',d,8)
    off=12
    ents=[]
    for i in range(n+1):
        rid,o=struct.unpack_from('<HI',d,off); off+=6
        ents.append((rid,o))
    als=[]
    for i in range(aliases):
        als.append(struct.unpack_from('<HH',d,off)); off+=4
    res={}
    order=[]
    for i in range(n):
        rid,o=ents[i]; e=ents[i+1][1]
        res[rid]=d[o:e]; order.append(rid)
    return enc,order,res,als
def write_pak(path,enc,order,res,als):
    n=len(order); hdr=12+6*(n+1)+4*len(als)
    out=bytearray(struct.pack('<IBxxxHH',5,enc,n,len(als)))
    off=hdr
    for rid in order:
        out+=struct.pack('<HI',rid,off); off+=len(res[rid])
    out+=struct.pack('<HI',0,off)
    for a in als: out+=struct.pack('<HH',*a)
    for rid in order: out+=res[rid]
    open(path,'wb').write(out)
