"""Run in background Blender on Alpine 27 or Hockey Arena - Match Night.
The path after -- is the game's src/assets directory. Source scenes are read-only.
"""
import base64
import collections
import json
import math
import sys
import zlib
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

output = Path(sys.argv[sys.argv.index("--") + 1])
V = Vector
up = V((0, 1, 0))
forward = V((0, 0, 1))


def game(v):
    return V((v.x, v.z, -v.y))


def save(name, value):
    raw = json.dumps(value, separators=(",", ":")).encode()
    encoded = base64.b64encode(zlib.compress(raw, 9)).decode()
    (output / (name + ".json")).write_text(json.dumps(encoded) + "\n")


def frame(origin, direction, facing=forward):
    y = direction.normalized()
    z = (facing - y * y.dot(facing)).normalized()
    mat = Matrix((y.cross(z), y, z)).transposed().to_4x4()
    mat.translation = origin
    return mat


def player():
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    bones = arm.data.bones
    def head(name):
        return game(arm.matrix_world @ bones[name].head_local)
    def axis(name):
        return game(bones[name].tail_local - bones[name].head_local)
    transforms = {}
    def bind(name, target, src, dst, stretch=1):
        scale = Matrix.Diagonal(V((1, stretch, 1, 1)))
        transforms[name] = (target, dst @ scale @ src.inverted())
    hip = head('Pelvis')
    shoulder_center=(head('UpperArm.L')+head('UpperArm.R'))*.5
    torso_axis=shoulder_center-hip
    for name, target, height in [('Pelvis','pelvis',0),('Spine','spine1',.04),('Chest','spine3',.04)]:
        # All three solver spine pivots are close to the pelvis.
        bind(name,target,frame(hip,torso_axis),Matrix.Translation((0,height,0)),(.51-height)/torso_axis.length)
    for name, target, h in [('Head','head',.68),('Neck','neck',.57)]:
        bind(name,target,Matrix.Translation(head(name)),Matrix.Translation((0,h,0)))
    for side,sign in [('L',1),('R',-1)]:
        d1 = V((sign*.3,-1,.05)).normalized()
        d2 = V((sign*.12,-1,.3)).normalized()
        p = V((sign*.235,.51,0))
        suffix = '.'+side
        for name,key,d,length in [('UpperArm','upper',d1,.31),('Forearm','fore',d2,.30)]:
            bone=name+suffix
            bind(bone,key+side,frame(head(bone),axis(bone)),frame(p,d),length/axis(bone).length)
            p=p+d*length
        bind('Hand'+suffix,'hand'+side,frame(head('Hand'+suffix),axis('Forearm'+suffix)),frame(p,d2))
        for name,key,h in [('Thigh','thigh',-.05),('Shin','shin',-.51)]:
            bone=name+suffix
            bind(bone,key+side,frame(head(bone),-axis(bone)),frame(V((sign*.11,h,0)),up),.46/axis(bone).length)
        bone='Foot'+suffix
        bind(bone,'foot'+side,Matrix.Translation(head(bone)),Matrix.Translation((sign*.11,-.97+.067,0)))
    shaft=bpy.data.objects['Flex 85 | composite shaft']
    coords=sorted([game(shaft.matrix_world@v.co) for v in shaft.data.vertices],key=lambda p:p.y)
    heel=sum(coords[:4],V((0,0,0)))/4
    tip=sum(coords[-4:],V((0,0,0)))/4
    stickdir=V((0,1,-.35))
    bind('Stick','stick',frame(heel,tip-heel,V((1,0,0))),frame(V((.45,-1.05,.9)),stickdir))
    bind('Blade','blade',frame(heel,up,V((1,0,0))),Matrix.Translation((.45,-1.025,.9)))
    skip=('Twill','Woven shield','Embroidered','Back numerals','Player name','Woven cuff ID','Helmet front print')
    def surface(o,m):
        n=m.name.lower() if m else ''
        if 'sweater' in o.name.lower(): return 'jersey'
        if 'stocking' in o.name.lower(): return 'socks'
        if 'pant' in o.name.lower() or 'breezer' in o.name.lower(): return 'pants'
        for token,key in [('polycarbonate','visor'),('clear ear','visor'),('skin','skin'),('sclera','eyeWhite'),('iris','iris'),('corneal','iris'),('hair','hair'),('espresso','hair'),('eyebrow','hair'),('helmet enamel','helmet'),('pearl white','helmet'),('steel','steel'),('titanium','steel'),('copper','steel'),('nylon','pad'),('tape','tape'),('cotton','tape'),('glove','glove'),('teal','trim'),('marigold','trim'),('ivory','pad')]:
            if token in n:return key
        return 'stick' if o.users_collection[0].name.startswith('05_') else 'boot'
    graph=bpy.context.evaluated_depsgraph_get()
    for level,ratio in [('detail',.28),('broadcast',.085),('wide',.026)]:
        data={'p':[],'uv':[],'j':[],'w':[],'bones':list(dict.fromkeys(t[0] for t in transforms.values())),'tri':collections.defaultdict(list)}
        selected=[]
        for o in sorted(arm.children,key=lambda x:x.name):
            if o.type not in {'MESH','CURVE','FONT'} or o.hide_render or o.name.startswith(skip):continue
            if any(m and 'Corneal gloss' in m.name for m in o.data.materials):continue
            if level!='detail' and (max(o.dimensions)<(.09 if level=='wide' else .045) or o.type=='CURVE'):continue
            if level=='wide' and o.name.startswith(('Shaft finish','Spiral friction','Grip tape','Helmet energy liner')):continue
            if o.type=='CURVE':
                o.data.resolution_u=2
                o.data.bevel_resolution=0
            for mod in o.modifiers:
                if mod.type in ('SUBSURF','BEVEL'):mod.show_viewport=False
            mod=None
            if o.type=='MESH' and len(o.data.polygons)>12:
                mod=o.modifiers.new('Broadcast reduction','DECIMATE')
                mod.ratio=ratio
            selected.append((o,mod))
        bpy.context.view_layer.update()
        graph=bpy.context.evaluated_depsgraph_get()
        for o,mod in selected:
            obj=o.evaluated_get(graph)
            mesh=obj.to_mesh()
            mesh.calc_loop_triangles()
            base=len(data['p'])//3
            for v in mesh.vertices:
                p=game(obj.matrix_world@v.co)
                rigid='Stick' if o.users_collection[0].name.startswith('05_') else o.parent_bone
                if rigid=='Stick' and o.name.startswith(('Taped rocker blade','Spiral friction tape')):rigid='Blade'
                weights=[(rigid,1)] if rigid else sorted([(o.vertex_groups[g.group].name,g.weight) for g in v.groups if g.weight>.001 and o.vertex_groups[g.group].name in transforms],key=lambda x:-x[1])[:4]
                weights=weights or [('Chest',1)]
                total=sum(k for _,k in weights)
                point=sum(((transforms[b][1]@p)*(k/total) for b,k in weights),V((0,0,0)))
                data['p'].extend(round(x*10000) for x in point)
                for i in range(4):
                    b,k=weights[i] if i<len(weights) else ('Pelvis',0)
                    data['j'].append(data['bones'].index(transforms[b][0]))
                    data['w'].append(round(k/total*255))
                u=(math.atan2(point.z,point.x)/(2*math.pi))%1
                h=max(0,min(1,(point.y+.02)/.62))
                vcoord=.5+.5*h
                if o.name.startswith('Home sweater'):
                    arm_weight=sum(k for b,k in weights if 'Arm.' in b or 'Forearm.' in b)
                    if arm_weight>total*.45:
                        sign=1 if point.x>0 else -1
                        shoulder=V((sign*.235,.51,0))
                        arm_axis=V((sign*.3,-1,.05)).normalized()
                        along=(point-shoulder).dot(arm_axis)
                        center=shoulder+arm_axis*along
                        radial=point-center
                        u=.5-math.atan2(sign*radial.z,sign*radial.x)/(2*math.pi)
                        vcoord=min(.48,max(0,along*.80))
                elif o.name.startswith('Protective knit stocking'):
                    vcoord=max(0,min(1,(point.y+.93)/.48))
                data['uv'].extend((round(u*65535),round(vcoord*65535)))
            for t in mesh.loop_triangles:
                mat=mesh.materials[t.material_index] if len(mesh.materials)>t.material_index else None
                data['tri'][surface(o,mat)].extend(base+i for i in t.vertices)
            obj.to_mesh_clear()
        for o,mod in selected:
            if mod:o.modifiers.remove(mod)
        print(level,len(data['p'])//3,sum(map(len,data['tri'].values()))//3,flush=True)
        save('alpine-'+level,data)


def arena():
    graph=bpy.context.evaluated_depsgraph_get()
    result={'seat':[],'bowl':{},'ceiling':{}}
    for c in bpy.data.collections:
        if c.name not in ('Stands','Roof','Lighting') and not c.name.startswith('Gallery '):continue
        for o in c.objects:
            if o.type not in ('MESH','CURVE') or o.hide_render:continue
            if o.type=='MESH' and ('seat shell' in o.data.name.lower() or o.name.startswith('Seat ')):
                p=game(o.matrix_world.translation)
                result['seat'].extend([round(p.x*100),round(p.y*100),round(p.z*100),round(o.rotation_euler.z*1000)])
                continue
            if o.name.startswith(('Scoreboard','Score','Clock','Event floor','Envelope','Section number')):continue
            layer=result['ceiling' if c.name in ('Roof','Lighting') else 'bowl']
            if o.type=='CURVE':o.data.resolution_u=2;o.data.bevel_resolution=0
            obj=o.evaluated_get(graph)
            m=obj.to_mesh()
            m.calc_loop_triangles()
            local={}
            for tri in m.loop_triangles:
                mat=m.materials[tri.material_index] if len(m.materials) else None
                color=tuple(mat.diffuse_color[:3]) if mat else (.25,.25,.25)
                key=','.join(str(round(k*255)) for k in color)
                batch=layer.setdefault(key,[[],[]])
                for i in tri.vertices:
                    pair=(key,i)
                    if pair not in local:
                        local[pair]=len(batch[0])//3
                        p=game(obj.matrix_world@m.vertices[i].co)
                        batch[0].extend(round(x*100) for x in p)
                    batch[1].append(local[pair])
            obj.to_mesh_clear()
    # Bake front-three-quarter portraits of seated source spectators. A depth
    # buffer resolves crossed arms and legs without an external render engine.
    import numpy as np
    fans=list(bpy.data.collections['Seated spectator models'].objects)
    tile_w,tile_h=64,128
    atlas=np.zeros((tile_h,tile_w*8,4),dtype=np.uint8)
    for tile,o in enumerate(fans[::9][:8]):
        depth=np.full((tile_h,tile_w),-1e10)
        m=o.data
        m.calc_loop_triangles()
        for tri in m.loop_triangles:
            pts=np.array([tuple(m.vertices[i].co) for i in tri.vertices])
            xx=(pts[:,0]*.96+pts[:,1]*.28)*72+tile_w/2
            yy=(1.60-pts[:,2]-(pts[:,1]*.12))*76
            zz=pts[:,0]*.28-pts[:,1]*.96+pts[:,2]*.12
            x0=max(0,int(np.floor(xx.min())));x1=min(tile_w-1,int(np.ceil(xx.max())))
            y0=max(0,int(np.floor(yy.min())));y1=min(tile_h-1,int(np.ceil(yy.max())))
            den=(yy[1]-yy[2])*(xx[0]-xx[2])+(xx[2]-xx[1])*(yy[0]-yy[2])
            if abs(den)<1e-8 or x0>x1 or y0>y1:continue
            y,x=np.mgrid[y0:y1+1,x0:x1+1]+.5
            a=((yy[1]-yy[2])*(x-xx[2])+(xx[2]-xx[1])*(y-yy[2]))/den
            b=((yy[2]-yy[0])*(x-xx[2])+(xx[0]-xx[2])*(y-yy[2]))/den
            c=1-a-b
            z=a*zz[0]+b*zz[1]+c*zz[2]
            region=depth[y0:y1+1,x0:x1+1]
            mask=(a>=0)&(b>=0)&(c>=0)&(z>region)
            region[mask]=z[mask]
            rgb=np.array(m.materials[tri.material_index].diffuse_color[:3])
            light=.46+.54*max(0,tri.normal.dot(V((-.35,-.45,.82))))
            color=np.clip((rgb*light)**(1/2.2)*255,0,255)
            atlas[y0:y1+1,tile*tile_w+x0:tile*tile_w+x1+1][mask]=[*color,255]
    result['fans']=base64.b64encode(atlas[::-1].tobytes()).decode()
    crowd=bpy.data.collections['Spectators'].objects[0].data
    result['attendance']=[]
    for i,v in enumerate(crowd.vertices):
        p=game(v.co)
        model=crowd.attributes['fan_model'].data[i].value
        result['attendance'].extend([round(x*100) for x in p]+[model%8])
    shell=bpy.data.collections['Gallery 301'].objects[0].data
    shell.calc_loop_triangles()
    result['chair']=[[round(x*1000) for v in shell.vertices for x in game(v.co)],[i for t in shell.loop_triangles for i in t.vertices]]

    print('Seats:',len(result['seat'])//4,flush=True)
    save('match-night',result)


if bpy.data.collections.get('Stands'):arena()
else:player()
