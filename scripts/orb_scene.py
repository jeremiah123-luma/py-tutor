# The py-tutor talk orb, built in Blender. Render: ORB_RES=640 ORB_SAMPLES=48 ORB_HAZE=0.18 ORB_GLOW=1.0 blender -b -P scripts/orb_scene.py -- <idle|thinking|speaking> <out_dir> anim
# A frosted-glass sphere (bright rim from the glass itself, faint milky haze inside) and a glowing ribbon in
# py-tutor's violet / pink / sky that twists and folds through it. Every motion is a whole number of cycles per
# loop, so the clip loops seamlessly.
import bpy, math, sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
STATE = argv[0] if argv else 'idle'
OUT = argv[1] if len(argv) > 1 else '/tmp/orb'
MODE = argv[2] if len(argv) > 2 else 'still'

FPS = 60
LOOP = {'idle': 6.0, 'thinking': 3.0, 'speaking': 4.0}[STATE]  # seconds per seamless loop
N = int(FPS * LOOP)
# how much the ribbon folds, and how fast it turns (turns per loop are whole numbers, so it loops)
FOLD = {'idle': 0.55, 'thinking': 0.95, 'speaking': 0.75}[STATE]
TURNS = {'idle': 1, 'thinking': 2, 'speaking': 1}[STATE]
TWIST = {'idle': 200, 'thinking': 360, 'speaking': 260}[STATE]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 1, N

# ---------- render: Cycles on the GPU, transparent background (laid on #0B0B0B afterwards) ----------
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    sc.cycles.device = 'GPU'
except Exception as e:
    print('GPU not available, using CPU', e)
sc.cycles.samples = int(__import__('os').environ.get('ORB_SAMPLES', '96'))
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 10
sc.cycles.transmission_bounces = 10
sc.cycles.volume_bounces = 2
sc.render.film_transparent = True
import os
RES = int(os.environ.get('ORB_RES', '768'))
sc.render.resolution_x = sc.render.resolution_y = RES
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'

# world: dark, so the glass only picks up our lights
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.004, 0.004, 0.004, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 1.0

# ---------- camera ----------
cam = bpy.data.cameras.new('cam'); cam.lens = 85
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
co.location = (0, -6.4, 0); co.rotation_euler = (math.radians(90), 0, 0)

# ---------- lights: big soft ones behind and around, for the bright frosted rim ----------
# no lamps: the rim glow is in the glass material, and the ribbon is the only light inside

# ---------- the glass ----------
bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1.0)
glass = bpy.context.object; glass.name = 'glass'
bpy.ops.object.shade_smooth()
gm = bpy.data.materials.new('frost'); gm.use_nodes = True
nt = gm.node_tree; nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputMaterial')
bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
bsdf.inputs['Base Color'].default_value = (0.97, 0.97, 1.0, 1)
bsdf.inputs['Roughness'].default_value = 0.42          # frosted
bsdf.inputs['IOR'].default_value = 1.35
bsdf.inputs['Transmission Weight'].default_value = 1.0
lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
rimp = nt.nodes.new('ShaderNodeMath'); rimp.operation = 'POWER'; rimp.inputs[1].default_value = 1.6
nt.links.new(lw.outputs['Facing'], rimp.inputs[0])
rims = nt.nodes.new('ShaderNodeMath'); rims.operation = 'MULTIPLY_ADD'
rims.inputs[1].default_value = float(__import__('os').environ.get('ORB_RIM', '1.25')); rims.inputs[2].default_value = 0.06
nt.links.new(rimp.outputs[0], rims.inputs[0])
rim = nt.nodes.new('ShaderNodeEmission'); rim.inputs['Color'].default_value = (0.96, 0.96, 1.0, 1)
nt.links.new(rims.outputs[0], rim.inputs['Strength'])
add = nt.nodes.new('ShaderNodeAddShader')
nt.links.new(bsdf.outputs['BSDF'], add.inputs[0]); nt.links.new(rim.outputs[0], add.inputs[1])
nt.links.new(add.outputs[0], out.inputs['Surface'])
vol = nt.nodes.new('ShaderNodeVolumePrincipled')      # a faint milky haze inside: the ribbon glows through it
vol.inputs['Color'].default_value = (0.92, 0.92, 0.96, 1)
vol.inputs['Density'].default_value = float(__import__('os').environ.get('ORB_HAZE', '0.35'))
vol.inputs['Anisotropy'].default_value = 0.2
nt.links.new(vol.outputs['Volume'], out.inputs['Volume'])
glass.data.materials.append(gm)
if __import__('os').environ.get('ORB_NOGLASS'): glass.hide_render = True

# ---------- the ribbon: a smooth curve, extruded into a strip, twisted along its length ----------
cu = bpy.data.curves.new('ribbon', 'CURVE'); cu.dimensions = '3D'
cu.extrude = 0.19            # half its width
cu.bevel_depth = 0.05        # a little thickness, so the edges read as soft tubes of light
cu.bevel_resolution = 3
cu.resolution_u = 24
cu.twist_mode = 'Z_UP'
spl = cu.splines.new('POLY'); K = 48      # many points placed from a smooth formula every frame (see place())
spl.points.add(K - 1)
rb = bpy.data.objects.new('ribbon', cu); sc.collection.objects.link(rb)
# its glow: violet -> pink -> sky along the strip, brighter along both long edges (like the reference's folds)
rm = bpy.data.materials.new('ribbon'); rm.use_nodes = True
nt = rm.node_tree; nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputMaterial')
em = nt.nodes.new('ShaderNodeEmission')
tc = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
nt.links.new(tc.outputs['UV'], sep.inputs[0])
ramp = nt.nodes.new('ShaderNodeValToRGB')                 # colour along the length (x)
els = ramp.color_ramp.elements
els[0].position = 0.0; els[0].color = (0.30, 0.26, 0.95, 1)   # deep violet-blue
els[1].position = 1.0; els[1].color = (0.98, 0.32, 0.72, 1)   # pink
mid = els.new(0.45); mid.color = (0.62, 0.40, 1.0, 1)          # violet
sky = els.new(0.15); sky.color = (0.38, 0.62, 1.0, 1)          # sky blue
nt.links.new(sep.outputs['X'], ramp.inputs['Fac'])
# edges: distance from the middle of the strip's width (y), sharpened
edge = nt.nodes.new('ShaderNodeMath'); edge.operation = 'SUBTRACT'; edge.inputs[1].default_value = 0.5
nt.links.new(sep.outputs['Y'], edge.inputs[0])
ab = nt.nodes.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; nt.links.new(edge.outputs[0], ab.inputs[0])
pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 3.0
mul2 = nt.nodes.new('ShaderNodeMath'); mul2.operation = 'MULTIPLY'; mul2.inputs[1].default_value = 2.0
nt.links.new(ab.outputs[0], mul2.inputs[0]); nt.links.new(mul2.outputs[0], pw.inputs[0])
strength = nt.nodes.new('ShaderNodeMath'); strength.operation = 'MULTIPLY_ADD'
strength.inputs[1].default_value = float(__import__('os').environ.get('ORB_EDGE', '2.6')); strength.inputs[2].default_value = float(__import__('os').environ.get('ORB_GLOW', '0.85'))
nt.links.new(pw.outputs[0], strength.inputs[0])
nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
nt.links.new(strength.outputs[0], em.inputs['Strength'])
nt.links.new(em.outputs[0], out.inputs['Surface'])
rb.data.materials.append(rm)

# ---------- motion: everything is a sine of the loop phase, so frame N+1 == frame 1 ----------
P = f'(frame-1)/{N}*2*pi'   # loop phase
def drive(target, path, expr, index=-1):
    fc = target.driver_add(path, index) if index >= 0 else target.driver_add(path)
    fc.driver.expression = expr
    return fc
# the strip's centre line and twist, placed from smooth sines of the loop phase on every frame
def place(scene, *_):
    ph = (scene.frame_current - 1) / N * 2 * math.pi
    for i, pt in enumerate(spl.points):
        u = i / (K - 1) - 0.5                       # -0.5 .. 0.5 along the strip
        x = u * 1.2
        y = FOLD * 0.30 * math.sin(u * 5.0 + ph) + FOLD * 0.10 * math.sin(u * 9.0 - ph * 2)
        z = FOLD * 0.22 * math.sin(u * 4.0 + ph * 2 + 0.6)
        pt.co = (x, y, z, 1)
        pt.tilt = math.radians(TWIST) * 0.45 * math.sin(u * 3.5 + ph)
bpy.app.handlers.frame_change_pre.append(place)
place(sc)
drive(rb, 'rotation_euler', f'0.85*sin({P}*{TURNS})', 2)   # sways, mostly facing us (a full spin shows it edge-on)
drive(rb, 'rotation_euler', f'0.45*sin({P})+0.3', 0)
drive(rb, 'rotation_euler', f'0.3*sin({P}*2+1.1)', 1)

sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
if MODE == 'still':
    for f in ([1, N // 4, N // 2, 3 * N // 4] if len(argv) < 4 else [int(argv[3])]):
        sc.frame_set(f)
        sc.render.filepath = f'{OUT}/{STATE}-still-{f:04d}.png'
        bpy.ops.render.render(write_still=True)
else:
    sc.render.filepath = f'{OUT}/{STATE}/f'
    bpy.ops.render.render(animation=True)
print('done', STATE, MODE, N)
