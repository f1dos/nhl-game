"""Original development assets. Run with blender --background --python this_file.

These are rigged modelling studies, not accepted final character art.
Units: metres; Blender Z up, glTF Y up. No external artwork is used.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'models' / 'hockey'
OUT.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0

def bind(obj, name, mat, bone, rig):
    obj.name = name
    obj.data.materials.append(mat)
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    modifier = obj.modifiers.new('Skeleton', 'ARMATURE')
    modifier.object = rig
    obj.parent = rig
    return obj

def tube(name, points, radius, mat, bone, rig):
    curve = bpy.data.curves.new(name, 'CURVE'); curve.dimensions='3D'
    curve.bevel_depth=radius; curve.bevel_resolution=2
    spline=curve.splines.new('POLY'); spline.points.add(len(points)-1)
    for p, xyz in zip(spline.points,points): p.co=(*xyz,1)
    obj=bpy.data.objects.new(name,curve); bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True); bpy.ops.object.convert(target='MESH'); obj.select_set(False)
    return bind(obj,name,mat,bone,rig)

def plate(name, center, size, mat, bone, rig):
    # Bevelled, shaped protective equipment, not the underlying human body.
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj=bpy.context.object; obj.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel=obj.modifiers.new('Rounded sewn edge','BEVEL'); bevel.width=.018; bevel.segments=3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return bind(obj,name,mat,bone,rig)

def lettering(text, location, size, mat, bone, rig, back=False):
    curve=bpy.data.curves.new('Uniform lettering','FONT')
    curve.body=text; curve.align_x='CENTER'; curve.size=size; curve.extrude=.0005
    obj=bpy.data.objects.new(text,curve); bpy.context.collection.objects.link(obj)
    obj.location=location; obj.rotation_euler=(math.pi/2,0,math.pi if back else 0)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return bind(obj,text,mat,bone,rig)

def render_review(stem):
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.samples=24
    scene.cycles.use_denoising=False
    scene.render.resolution_x=900; scene.render.resolution_y=1100
    scene.render.resolution_percentage=100
    scene.world.color=(.16,.16,.16)
    for location,power,size in [((2,-3,4),550,4),((-3,-1,2),350,3),((1,3,3),650,3)]:
        bpy.ops.object.light_add(type='AREA', location=location)
        obj=bpy.context.object; obj.data.energy=power; obj.data.shape='DISK'; obj.data.size=size
        obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(2.4,-4.2,2.15))
    scene.camera=bpy.context.object; scene.camera.data.type='ORTHO'; scene.camera.data.ortho_scale=2.3
    scene.camera.rotation_euler=(Vector((0,-.1,.95))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/(stem+'-front.png'))
    bpy.ops.render.render(write_still=True)

def material(name, color, roughness=.8):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

def loft(name, rings, mat, bone, rig, sides=16):
    vertices, faces = [], []
    for x, y, z, rx, ry in rings:
        for i in range(sides):
            a = i * math.tau / sides
            vertices.append((x + rx * math.cos(a), y + ry * math.sin(a), z))
    for j in range(len(rings)-1):
        for i in range(sides):
            a = j*sides+i; b = j*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))), tuple(range((len(rings)-1)*sides,len(rings)*sides))])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in mesh.polygons: polygon.use_smooth = True
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(vertices))), 1, 'REPLACE')
    mod = obj.modifiers.new('Skeleton', 'ARMATURE'); mod.object = rig
    obj.parent = rig
    return obj

def build(goalie=False):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    jersey = material('Jersey / recolourable', (.04,.20,.36))
    dark = material('Protective equipment', (.025,.035,.05))
    white = material('Socks and pads', (.85,.87,.88))
    skin = material('Skin', (.55,.32,.21))
    metal = material('Skate steel', (.35,.4,.45), .25)
    accent = material('Uniform trim', (.65,.12,.045))
    arm = bpy.data.armatures.new('Hockey skeleton')
    rig = bpy.data.objects.new('Goalie' if goalie else 'Skater', arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig; rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name, head, tail, parent=None):
        b = arm.edit_bones.new(name); b.head=head; b.tail=tail
        if parent: b.parent=arm.edit_bones[parent]
    bone('root',(0,0,0),(0,0,.2))
    bone('pelvis',(0,0,.86),(0,0,1.02),'root')
    bone('spine',(0,0,1.02),(0,-.1,1.48),'pelvis')
    bone('head',(0,-.1,1.48),(0,-.13,1.8),'spine')
    for sign, side in [(-1,'L'),(1,'R')]:
        bone('thigh.'+side,(sign*.15,0,.93),(sign*.19,-.08,.54),'pelvis')
        bone('shin.'+side,(sign*.19,-.08,.54),(sign*.22,.03,.16),'thigh.'+side)
        bone('upperarm.'+side,(sign*.28,-.07,1.43),(sign*.38,-.16,1.17),'spine')
        bone('forearm.'+side,(sign*.38,-.16,1.17),(sign*.30,-.39,1.02),'upperarm.'+side)
    bpy.ops.object.mode_set(mode='OBJECT')
    loft('Tailored jersey',[(0,0,.92,.22,.14),(0,-.02,1.08,.25,.16),(0,-.05,1.3,.29,.18),(0,-.08,1.44,.31,.16),(0,-.09,1.5,.17,.12)],jersey,'spine',rig)
    loft('Neck',[(0,-.1,1.47,.07,.07),(0,-.11,1.58,.07,.07)],skin,'head',rig)
    loft('Face',[(0,-.13,1.55,.065,.07),(0,-.15,1.61,.09,.1),(0,-.14,1.72,.095,.1),(0,-.12,1.77,.07,.08)],skin,'head',rig)
    loft('Helmet shell',[(0,-.11,1.66,.112,.12),(0,-.11,1.75,.12,.125),(0,-.11,1.81,.09,.105),(0,-.11,1.83,.025,.04)],dark,'head',rig)
    for sign, side in [(-1,'L'),(1,'R')]:
        x=sign*.15
        loft('Hockey pants '+side,[(x,0,.75,.13,.13),(x,0,.9,.145,.15),(x,0,1.02,.13,.14)],dark,'thigh.'+side,rig)
        loft('Leg '+side,[(sign*.22,.03,.16,.075,.08),(sign*.20,-.04,.35,.085,.09),(sign*.19,-.08,.54,.105,.105),(x,0,.8,.1,.11)],white,'shin.'+side,rig)
        loft('Skate boot '+side,[(sign*.22,-.065,.06,.075,.18),(sign*.22,-.065,.12,.085,.18),(sign*.22,.025,.23,.065,.09)],dark,'shin.'+side,rig)
        loft('Blade '+side,[(sign*.22,-.07,.015,.009,.19),(sign*.22,-.07,.05,.009,.19)],metal,'shin.'+side,rig,8)
        loft('Sleeve '+side,[(sign*.38,-.16,1.14,.09,.10),(sign*.35,-.13,1.3,.115,.12),(sign*.27,-.07,1.45,.12,.13)],jersey,'upperarm.'+side,rig)
        loft('Forearm '+side,[(sign*.30,-.39,1.02,.08,.09),(sign*.35,-.28,1.1,.09,.1),(sign*.38,-.16,1.18,.095,.10)],jersey,'forearm.'+side,rig)
        loft('Glove '+side,[(sign*.30,-.42,.96,.09,.10),(sign*.30,-.42,1.05,.11,.12),(sign*.31,-.36,1.11,.09,.1)],dark,'forearm.'+side,rig)
        if goalie:
            loft('Goalie pad '+side,[(sign*.22,-.12,.09,.15,.12),(sign*.22,-.17,.38,.16,.12),(sign*.19,-.20,.65,.155,.1)],white,'shin.'+side,rig,12)
    # Continuous shaft follows the right glove; later IK work will constrain both hands.
    loft('Stick shaft',[(.55,-.55,.06,.018,.025),(.30,-.42,1.04,.018,.025),(.25,-.39,1.22,.018,.025)],dark,'forearm.R',rig,8)
    loft('Stick blade',[(.68,-.55,.025,.17,.025),(.68,-.55,.09,.17,.025)],dark,'forearm.R',rig,8)
    # Uniform seams, collar, cuff bands and readable original demonstration identity.
    for z in [.99,1.04]:
        loft('Jersey hem trim',[(0,-.01,z,.238,.155),(0,-.01,z+.025,.242,.158)],accent,'spine',rig)
    tube('Collar binding',[(-.12,-.215,1.49),(0,-.255,1.43),(.12,-.215,1.49)],.008,white,'spine',rig)
    lettering('NORTH',(0,-.25,1.32),.075,white,'spine',rig)
    lettering('31' if goalie else '27',(0,.132,1.14),.16,white,'spine',rig,True)
    lettering('KEEPER' if goalie else 'SKATER',(0,.108,1.38),.044,white,'spine',rig,True)
    for sign,side in [(-1,'L'),(1,'R')]:
        for z in [.33,.37]:
            loft('Sock band '+side,[(sign*.205,-.035,z,.091,.10),(sign*.205,-.035,z+.025,.091,.10)],accent,'shin.'+side,rig)
        for i in range(5):
            y=-.17+i*.025
            tube('Boot lace '+side,[ (sign*.22-.045,y,.15),(sign*.22+.045,y+.015,.15)],.003,white,'shin.'+side,rig)
        for i in range(4):
            plate('Glove finger padding '+side,(sign*.30-.065+i*.04,-.524,1.015),(.032,.022,.085),dark,'forearm.'+side,rig)
        tube('Helmet chin strap '+side,[(sign*.1,-.12,1.68),(sign*.08,-.16,1.57),(0,-.20,1.55)],.006,dark,'head',rig)
        for i in range(3):
            plate('Helmet vent '+side,(sign*.112,-.13+i*.045,1.75),(.006,.025,.015),metal,'head',rig)
    # Curved polycarbonate visor follows the face, with side fasteners.
    visor=material('Visor',(.65,.85,.92),.1)
    visor.node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value=.85
    if not goalie:
        verts=[]; faces=[]
        for z in [1.64,1.72]:
            for i in range(17):
                a=math.pi+i*math.pi/16
                verts.append((.125*math.cos(a),-.115+.145*math.sin(a),z))
        for i in range(16): faces.append((i,i+1,i+18,i+17))
        mesh=bpy.data.meshes.new('Curved visor'); mesh.from_pydata(verts,[],faces)
        obj=bpy.data.objects.new('Curved visor',mesh); bpy.context.collection.objects.link(obj)
        bind(obj,'Curved visor',visor,'head',rig)
    else:
        plate('Blocker',(.33,-.53,1.04),(.22,.09,.29),white,'forearm.R',rig)
        loft('Catcher', [(-.35,-.48,.94,.1,.06),(-.35,-.51,1.06,.18,.08),(-.35,-.50,1.19,.13,.06)],white,'forearm.L',rig)
        for z in [1.59,1.64,1.69,1.74]:
            tube('Mask cage horizontal',[(-.11,-.20,z),(0,-.29,z),(.11,-.20,z)],.004,metal,'head',rig)
        for x in [-.07,0,.07]:
            tube('Mask cage vertical',[(x,-.24,1.57),(x,-.285,1.66),(x,-.24,1.77)],.004,metal,'head',rig)
        for sign,side in [(-1,'L'),(1,'R')]:
            plate('Sewn pad face '+side,(sign*.22,-.285,.38),(.275,.07,.62),white,'shin.'+side,rig)
            for z in [.17,.29,.41,.53]:
                tube('Pad seam '+side,[(sign*.22-.12,-.325,z),(sign*.22+.12,-.325,z)],.003,dark,'shin.'+side,rig)
    rig.animation_data_create()
    action=bpy.data.actions.new('Skating study'); rig.animation_data.action=action
    for frame in range(1,26):
        phase=(frame-1)/24*math.tau
        for side,offset in [('L',0),('R',math.pi)]:
            p=rig.pose.bones['thigh.'+side]; p.rotation_mode='XYZ'
            p.rotation_euler.x=math.sin(phase+offset)*.24
            p.keyframe_insert('rotation_euler',frame=frame)
    bpy.context.scene.frame_start=1; bpy.context.scene.frame_end=25
    bpy.context.scene.frame_set(1)
    stem='goalie-study' if goalie else 'skater-study'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / (stem+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(OUT / (stem+'.glb')),export_format='GLB',export_animations=True)
    render_review(stem)

build(False)
build(True)
