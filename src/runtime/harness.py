# Runs inside Pyodide. Executes learner code with fresh globals, scripted input(),
# a clean working directory seeded with lesson files, and captured output.
import ast, builtins, inspect, io, json, os, shutil, sys, traceback

WORK = "/home/pyodide/work"

# Constructs CS 100 hasn't covered (by default). Concepts can narrow or widen this.
BANNED_NODES = {
    "ListComp": "list comprehension",
    "DictComp": "dict comprehension",
    "SetComp": "set comprehension",
    "GeneratorExp": "generator expression",
    "Lambda": "lambda",
    "NamedExpr": "walrus operator (:=)",
    "Match": "match statement",
    "Yield": "yield / generators",
    "YieldFrom": "yield from",
    "AsyncFunctionDef": "async def",
    "Await": "await",
    "Global": "global",
    "Nonlocal": "nonlocal",
}
BANNED_IMPORTS = {"dataclasses", "collections", "itertools", "functools", "typing", "json", "csv", "pathlib", "re"}

FRIENDLY = {
    "KeyError": "That key isn't in the dictionary. Check the spelling, or use .get() if it might be missing.",
    "FileNotFoundError": "Python couldn't find that file. Check the file name, including the .txt part.",
    "NameError": "Python doesn't know that name yet. Is it spelled the same everywhere, and was it created before this line?",
    "TypeError": "Two things that don't fit together were combined, like adding a number to a string, or calling something with the wrong number of arguments.",
    "AttributeError": "That object doesn't have the attribute or method you asked for. Check the spelling, and whether you set it in __init__ with self.",
    "IndentationError": "The spacing at the start of a line is off. Everything inside a block needs the same indent.",
    "SyntaxError": "Python couldn't read this line. Look for a missing colon, bracket, or quote.",
    "ValueError": "The value had the right type but the wrong content, like int('abc').",
    "IndexError": "That position doesn't exist in the list. Lists start at 0 and stop at len - 1.",
    "ZeroDivisionError": "Something got divided by zero.",
    "EOFError": "The program asked for more input than was given. Add another line in the program input box.",
    "UnsupportedOperation": "The file was opened in the wrong mode. 'r' reads, 'w' writes, 'a' adds to the end.",
}


def banned_used(code, extra_allowed=()):
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return []
    found = []
    for node in ast.walk(tree):
        name = type(node).__name__
        if name in BANNED_NODES and name not in extra_allowed:
            found.append(BANNED_NODES[name])
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            mods = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
            for m in mods:
                root = m.split(".")[0]
                if root in BANNED_IMPORTS and root not in extra_allowed:
                    found.append("import " + root)
    return sorted(set(found))

def _reset_dir(files):
    os.chdir("/")
    if os.path.isdir(WORK):
        shutil.rmtree(WORK)
    os.makedirs(WORK)
    os.chdir(WORK)
    for path, content in (files or {}).items():
        full = os.path.join(WORK, path)
        os.makedirs(os.path.dirname(full) or WORK, exist_ok=True)
        with open(full, "w") as f:
            f.write(content)

def _read_dir():
    out = {}
    for root, _, names in os.walk(WORK):
        for n in names:
            full = os.path.join(root, n)
            rel = os.path.relpath(full, WORK)
            try:
                with open(full) as f:
                    out[rel] = f.read()
            except Exception:
                out[rel] = "<binary>"
    return out

def _error_info(exc, code_name):
    etype = type(exc).__name__
    line = None
    if isinstance(exc, SyntaxError):
        line = exc.lineno
    else:
        for fr in traceback.extract_tb(exc.__traceback__):
            if fr.filename == code_name:
                line = fr.lineno
    msg = str(exc)
    if isinstance(exc, SyntaxError):
        msg = exc.msg
    return {"type": etype, "message": msg, "line": line, "friendly": FRIENDLY.get(etype)}

def _show(v):
    """How a value looks in the step-through variables panel."""
    try:
        if isinstance(v, io.IOBase):
            return "file object (" + str(getattr(v, "name", "")) + ("" if not v.closed else ", closed") + ")"
        t = type(v)
        if t.__module__ == "__main__" and not isinstance(v, type):
            attrs = ", ".join(k + "=" + repr(x) for k, x in vars(v).items())
            return t.__name__ + " object: " + attrs if attrs else t.__name__ + " object"
        if isinstance(v, type):
            return "class " + v.__name__
        r = repr(v)
        return r if len(r) <= 80 else r[:77] + "..."
    except Exception:  # noqa
        return "?"

def _snapshot(g):
    out = []
    for k, v in g.items():
        if k.startswith("__") or callable(v) and not isinstance(v, type) or type(v).__name__ == "module":
            continue
        out.append([k, _show(v)])
    return out

def run(code, stdin=None, files=None, check=None, trace=False):
    """Run learner code once. Returns dict matching RunResult (minus ms/timedOut)."""
    _reset_dir(files)
    lines = list(stdin or [])
    out, err = io.StringIO(), io.StringIO()

    def fake_input(prompt=""):
        out.write(str(prompt))
        if not lines:
            raise EOFError("EOF when reading a line")
        return lines.pop(0)  # zyBooks: prompt is printed, the typed input is not

    g = {"__name__": "__main__", "__builtins__": builtins}
    old_out, old_err, old_input = sys.stdout, sys.stderr, builtins.input
    sys.stdout, sys.stderr = out, err
    builtins.input = fake_input
    error = None
    check_error = None
    steps = []
    pending = [None]

    def local(frame, event, arg):
        if event == "line" and len(steps) < 300:
            if pending[0] is not None:
                steps.append({"line": pending[0], "vars": _snapshot(g), "out": out.getvalue()})
            pending[0] = frame.f_lineno
        return local

    def tracer(frame, event, arg):
        return local if frame.f_code.co_filename == "<student>" else None

    try:
        try:
            if trace:
                sys.settrace(tracer)
            try:
                exec(compile(code, "<student>", "exec"), g)
            finally:
                if trace:
                    sys.settrace(None)
                    if pending[0] is not None:
                        steps.append({"line": pending[0], "vars": _snapshot(g), "out": out.getvalue()})
        except SystemExit:
            pass
        except BaseException as e:  # noqa
            error = _error_info(e, "<student>")
        if check is not None and error is None:
            try:
                exec(compile(check, "<check>", "exec"), g)
            except AssertionError as e:
                check_error = str(e) or "a check didn't pass"
            except BaseException as e:  # noqa
                info = _error_info(e, "<check>")
                check_error = info["type"] + ": " + info["message"]
    finally:
        sys.stdout, sys.stderr, builtins.input = old_out, old_err, old_input
    res = {"stdout": out.getvalue(), "stderr": err.getvalue(), "files": _read_dir()}
    if error:
        res["error"] = error
    if trace:
        res["steps"] = steps
    if check is not None:
        res["checkError"] = check_error
    return res

def _norm(s):
    return s.rstrip("\n")

def grade(code, tests, extra_allowed=()):
    results = []
    for t in tests:
        r = run(code, t.get("stdin"), t.get("files"), t.get("check"))
        passed = True
        expected = got = errtxt = None
        if r.get("error"):
            passed = False
            e = r["error"]
            errtxt = e["type"] + ": " + e["message"] + (f" (line {e['line']})" if e.get("line") else "")
            if t.get("expectStdout") is not None:
                # still show what it should print next to whatever printed before the crash
                expected, got = t["expectStdout"], r.get("stdout") or ""
        if passed and t.get("expectStdout") is not None:
            if _norm(r["stdout"]) != _norm(t["expectStdout"]):
                passed = False
                expected, got = t["expectStdout"], r["stdout"]
        if passed and t.get("check") is not None and r.get("checkError"):
            passed = False
            errtxt = r["checkError"]
        if passed and t.get("expectFiles"):
            for p, content in t["expectFiles"].items():
                actual = r["files"].get(p)
                if actual is None or _norm(actual) != _norm(content):
                    passed = False
                    expected = f"{p}:\n{content}"
                    got = f"{p}:\n{actual}" if actual is not None else f"{p} was not created"
                    break
        results.append({"name": t["name"], "passed": passed, "hidden": bool(t.get("hidden")),
                        "expected": expected, "got": got, "error": errtxt})
    bu = banned_used(code, extra_allowed)
    return {"passed": all(x["passed"] for x in results) and not bu, "results": results, "bannedUsed": bu}


# ---------- Visualizer: a frames-and-objects trace of any program, one step per executed line ----------
VIZ_MAX_STEPS = 1000
_PRIMS = (int, float, bool, complex, str, type(None))

class _TooManySteps(Exception):
    pass

def visualize(code, stdin=None, files=None):
    _reset_dir(files)
    lines = list(stdin or [])
    out = io.StringIO()

    def fake_input(prompt=""):
        out.write(str(prompt))
        if not lines:
            raise EOFError("EOF when reading a line")
        val = lines.pop(0)
        out.write(val + "\n")  # show what was typed, like a real terminal
        return val

    g = {"__name__": "__main__", "__builtins__": builtins}
    keep = []      # holds every object we've numbered so ids are never reused
    ids = {}       # id(obj) -> small stable number
    frame_ids = {}
    steps = []
    last_line = [None]

    def ref_of(o):
        k = id(o)
        if k not in ids:
            ids[k] = len(ids) + 1
            keep.append(o)
        return ids[k]

    def enc(v, heap):
        if isinstance(v, _PRIMS):
            if isinstance(v, str):
                return ["str", repr(v) if len(v) <= 60 else repr(v[:57]) + "..."]
            return [type(v).__name__ if v is not None else "none", repr(v)]
        n = ref_of(v)
        if n not in heap:
            heap[n] = None  # placeholder breaks cycles
            heap[n] = enc_obj(v, heap)
        return ["ref", n]

    def enc_obj(v, heap):
        try:
            if isinstance(v, io.IOBase):
                return {"kind": "file", "label": "file", "name": str(getattr(v, "name", "")),
                        "mode": str(getattr(v, "mode", "")), "closed": bool(v.closed)}
            if isinstance(v, list):
                return {"kind": "list", "label": "list", "items": [enc(x, heap) for x in v[:60]], "more": max(0, len(v) - 60)}
            if isinstance(v, tuple):
                return {"kind": "tuple", "label": "tuple", "items": [enc(x, heap) for x in v[:60]], "more": max(0, len(v) - 60)}
            if isinstance(v, (set, frozenset)):
                items = list(v)
                try:
                    items.sort()
                except Exception:  # noqa
                    pass
                return {"kind": "set", "label": type(v).__name__, "items": [enc(x, heap) for x in items[:60]], "more": max(0, len(v) - 60)}
            if isinstance(v, dict):
                pairs = list(v.items())[:60]
                return {"kind": "dict", "label": "dict", "pairs": [[enc(k, heap), enc(x, heap)] for k, x in pairs], "more": max(0, len(v) - 60)}
            if type(v).__name__ in ("dict_keys", "dict_values", "dict_items"):
                return {"kind": "list", "label": type(v).__name__, "items": [enc(x, heap) for x in list(v)[:60]], "more": 0}
            if isinstance(v, type):
                attrs = [[k, enc(x, heap)] for k, x in vars(v).items() if not k.startswith("__") or inspect.isfunction(x)]
                return {"kind": "class", "label": v.__name__ + " class", "attrs": attrs}
            if inspect.isfunction(v) or inspect.ismethod(v):
                f = v.__func__ if inspect.ismethod(v) else v
                try:
                    sig = str(inspect.signature(f))
                except Exception:  # noqa
                    sig = "(...)"
                return {"kind": "function", "label": "function", "name": f.__name__ + sig}
            if callable(v) and type(v).__name__ == "builtin_function_or_method":
                return {"kind": "function", "label": "built-in function", "name": getattr(v, "__name__", "?")}
            if hasattr(v, "__dict__") and type(v).__module__ == "__main__":
                attrs = [[k, enc(x, heap)] for k, x in vars(v).items()]
                return {"kind": "instance", "label": type(v).__name__ + " instance", "attrs": attrs}
            r = repr(v)
            return {"kind": "other", "label": type(v).__name__, "repr": r if len(r) <= 80 else r[:77] + "..."}
        except Exception:  # noqa
            return {"kind": "other", "label": type(v).__name__, "repr": "?"}

    def visible(k, v):
        if k.startswith("__") or k == "__builtins__":
            return False
        return type(v).__name__ != "module"

    def snapshot(frame, event, arg):
        heap = {}
        stack = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == "<student>":
                stack.append(f)
            f = f.f_back
        stack.reverse()
        frames = []
        for f in stack:
            is_global = f.f_code.co_name == "<module>"
            src = g if is_global else f.f_locals
            fid = frame_ids.setdefault(id(f), len(frame_ids) + 1)
            if not is_global:
                keep.append(f)
            vars_ = [[k, enc(v, heap)] for k, v in list(src.items()) if visible(k, v)]
            fr = {"id": fid, "name": "Global frame" if is_global else f.f_code.co_name, "vars": vars_}
            if f is frame and event == "return" and not is_global:
                fr["returnValue"] = enc(arg, heap)
            frames.append(fr)
        return frames, heap

    def record(frame, event, arg):
        if len(steps) >= VIZ_MAX_STEPS:
            raise _TooManySteps()
        frames, heap = snapshot(frame, event, arg)
        step = {"line": frame.f_lineno, "prevLine": last_line[0], "event": event,
                "frames": frames, "heap": [[k, heap[k]] for k in sorted(heap)], "out": out.getvalue()}
        if event == "exception":
            et, ev, _ = arg
            step["exception"] = et.__name__ + ": " + str(ev)
        steps.append(step)

    def local(frame, event, arg):
        if event in ("line", "return", "exception"):
            if event == "return" and frame.f_code.co_name == "<module>":
                return local  # the "done" step shows the end
            record(frame, event, arg)
            if event == "line":
                last_line[0] = frame.f_lineno
        return local

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != "<student>":
            return None
        if event == "call" and frame.f_code.co_name != "<module>":
            record(frame, "call", arg)
        return local

    old_out, old_input = sys.stdout, builtins.input
    sys.stdout = out
    builtins.input = fake_input
    error = None
    stopped = False
    try:
        try:
            compiled = compile(code, "<student>", "exec")
        except SyntaxError as e:
            error = _error_info(e, "<student>")
            compiled = None
        if compiled is not None:
            sys.settrace(tracer)
            try:
                exec(compiled, g)
            except _TooManySteps:
                stopped = True
            except SystemExit:
                pass
            except BaseException as e:  # noqa
                error = _error_info(e, "<student>")
            finally:
                sys.settrace(None)
    finally:
        sys.stdout, builtins.input = old_out, old_input
    # one last step showing how things ended: the program's final state, or where the error happened
    if steps and not stopped:
        last = dict(steps[-1])
        last["prevLine"] = last_line[0]
        last["line"] = None
        last["out"] = out.getvalue()
        if error is None:
            heap = {}
            last["event"] = "done"
            last["frames"] = [{"id": 1, "name": "Global frame", "vars": [[k, enc(v, heap)] for k, v in list(g.items()) if visible(k, v)]}]
            last["heap"] = [[k, heap[k]] for k in sorted(heap)]
        else:
            last["event"] = "error"
            last["exception"] = error["type"] + ": " + error["message"]
        steps.append(last)
    res = {"steps": steps, "stdout": out.getvalue(), "stopped": stopped, "maxSteps": VIZ_MAX_STEPS}
    if error:
        res["error"] = error
    return res

def handle(req_json):
    req = json.loads(req_json)
    if req["kind"] == "run":
        return json.dumps(run(req["code"], req.get("stdin"), req.get("files"), trace=bool(req.get("trace"))))
    if req["kind"] == "visualize":
        return json.dumps(visualize(req["code"], req.get("stdin"), req.get("files")))
    if req["kind"] == "grade":
        return json.dumps(grade(req["code"], req["tests"], tuple(req.get("extraAllowed") or ())))
    raise ValueError("unknown request kind")
