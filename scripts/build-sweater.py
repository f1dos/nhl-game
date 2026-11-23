"""blender -b -P scripts/build-sweater.py (run at repository root)."""
import bpy
import math
from mathutils import Vector
from pathlib import Path

bpy.ops.wm.read_factory_settings(use_empty=True)
# Dimensions in metres, pelvis origin, forward towards negative Blender Y.
def coord(x, y, z):
    return (x, -z, y)

profile = [
    (.006,.228,.158), (.017,.230,.159), (.055,.227,.157),
    (.104,.222,.148), (.147,.207,.141), (.181,.213,.149),
    (.214,.209,.146), (.27,.215,.15), (.325,.236,.161),
    (.364,.251,.166), (.427,.257,.178), (.493,.262,.172),
    (.546,.249,.153), (.570,.202,.132), (.595,.138,.101), (.614,.077,.067),
]
verts, faces, weights, face_uv = [], [], [], []
N = 32
def vertex(p, w):
    verts.append(coord(*p))
    weights.append(w)
    return len(verts)-1

def quad(indices, uv):
    faces.append(indices)
    face_uv.append([(u, 1-v) for u,v in uv])

def torso(i,j):
    return i*N+j%N

for i,(y,rx,rz) in enumerate(profile):
    for j in range(N):
        a = j*math.tau/N
        c,s = math.cos(a),math.sin(a)
        waist = math.exp(-((y-.15)/.14)**2)
        folds = waist*(.041*math.cos(7*a+8*y)+.042*math.sin(y*70+4*c+s))
        hem = max(0,1-y/.12)*.52
        clav = max(0,abs(c)-.50)*min(1,max(0,(y-.34)/.14))
        middle = min(1,max(0,(y-.17)/.14))
        upper = min(1,max(0,(y-.31)/.13))
        w = {'spine1':(1-middle)*(1-hem), 'spine2':middle*(1-upper),
             'spine3':upper*(1-clav), 'clavL' if c>0 else 'clavR':clav*upper,
             'jerseyF' if s>0 else 'jerseyB':hem*s*s,
             'jerseyL' if c>0 else 'jerseyR':hem*c*c}
        lift = -.035*max(0,s)**5*max(0,(y-.53)/.084)-.014*s*s*max(0,1-y/.10)
        vertex((rx*c*(1+folds),y+lift,rz*s*(1+folds)),w)
for i in range(len(profile)-1):
    v0,v1 = [.5+(profile[k][0]-.006)/.608*.49 for k in (i,i+1)]
    for j in range(N):
        if 9<=i<12 and ((j+4)%16)<8:
            continue
        quad([torso(i,j),torso(i+1,j),torso(i+1,j+1),torso(i,j+1)],
             [(j/N,v0),(j/N,v1),((j+1)/N,v1),((j+1)/N,v0)])

for sign,side,center in [(1,'L',0),(-1,'R',16)]:
    # Extrude sleeves from the actual boundary of each armhole.
    path = ([(9,j) for j in range(-4,4)]+[(i,4) for i in range(9,12)]
            +[(12,j) for j in range(4,-4,-1)]+[(i,-4) for i in range(12,9,-1)])
    prev = [torso(i,center+j) for i,j in path]
    angles = [math.atan2(-verts[k][1], verts[k][2]-.455) for k in prev]
    pv = 0
    for x,y,z,ry,rz,v,blend in [
        (.269,.477,.001,.083,.108,.055,.02),(.286,.442,.004,.089,.102,.09,.04),
        (.291,.400,.007,.086,.096,.13,.04),(.306,.335,.011,.081,.09,.19,.06),
        (.32,.267,.015,.075,.08,.23,.16),(.327,.23,.018,.081,.082,.27,.38),
        (.328,.201,.023,.075,.076,.30,.62),(.336,.174,.03,.073,.076,.32,.82),
        (.339,.144,.036,.066,.07,.34,.94),(.35,.055,.064,.062,.066,.41,1),
        (.355,-.027,.086,.058,.062,.47,1),(.356,-.039,.089,.058,.061,.48,1)]:
        nxt=[]
        roll=min(1,max(0,(.48-y)/.10))
        for a in angles:
            c,s=math.cos(a),math.sin(a)
            radius=ry*(1+.055*math.cos(3*a+18*y))
            nxt.append(vertex((sign*(x+c*radius*(.48+.52*roll)),y+c*radius*(.88-.62*roll),z+s*rz),
                              {'upper'+side:1-blend,'fore'+side:blend}))
        for j in range(len(prev)):
            k=(j+1)%len(prev)
            ids=[prev[j],nxt[j],nxt[k],prev[k]]
            uv=[(j/len(prev),pv),(j/len(prev),v),((j+1)/len(prev),v),((j+1)/len(prev),pv)]
            quad(ids,uv)
        prev,pv=nxt,v

mesh=bpy.data.meshes.new('Tailored sweater cage')
mesh.from_pydata(verts,[],faces)
mesh.update()
uv=mesh.uv_layers.new(name='Team atlas')
for p,coords in zip(mesh.polygons,face_uv):
    p.use_smooth=True
    for li,xy in zip(p.loop_indices,coords):
        uv.data[li].uv=xy
obj=bpy.data.objects.new('Sweater',mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj
obj.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
groups={name:obj.vertex_groups.new(name=name) for name in sorted({k for w in weights for k in w})}
for i,w in enumerate(weights):
    for name,value in w.items():
        if value>0: groups[name].add([i],value,'REPLACE')
# Authoring rig for the garment. Runtime remaps these joint names to match IK.
arm=bpy.data.armatures.new('Sweater bind rig')
rig=bpy.data.objects.new('GarmentRig',arm)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
for name in groups:
    b=arm.edit_bones.new(name)
    side=1 if name.endswith('L') else -1
    start={'spine1':(0,.04,0),'spine2':(0,.23,0),'spine3':(0,.40,0)}
    p=start.get(name,(side*.07,.49,0) if name.startswith('clav') else
                (side*.235,.51,0) if name.startswith('upper') else
                (side*.325,.214,.015) if name.startswith('fore') else (0,.085,0))
    b.head=coord(*p)
    b.tail=Vector(b.head)+Vector((0,0,.07))
for b in arm.edit_bones:
    parent= ('spine1' if b.name.startswith('jersey') or b.name=='spine2' else
             'spine2' if b.name=='spine3' else 'spine3' if b.name.startswith('clav') else
             'clav'+b.name[-1] if b.name.startswith('upper') else
             'upper'+b.name[-1] if b.name.startswith('fore') else None)
    if parent: b.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
def equip(o):
    o.parent=rig
    mod=o.modifiers.new('Garment skin','ARMATURE')
    mod.object=rig
for level in (0,1,2):
    copy=obj.copy()
    copy.data=obj.data.copy()
    bpy.context.collection.objects.link(copy)
    copy.name='sweater_lod'+str(level)
    bpy.context.view_layer.objects.active=copy
    if level:
        mod=copy.modifiers.new('Tailoring subdivision','SUBSURF')
        mod.levels=level
        bpy.ops.object.modifier_apply(modifier=mod.name)
    reduction=copy.modifiers.new('Screen distance budget','DECIMATE')
    reduction.ratio=(.32,.28,.22)[level]
    bpy.ops.object.modifier_apply(modifier=reduction.name)
    equip(copy)
bpy.data.objects.remove(obj,do_unlink=True)
out=Path.cwd()
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'public/models/hockey/sweater.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(out/'src/assets/sweater.glb'),export_format='GLB',export_animations=False)
