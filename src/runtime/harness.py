# Runs inside Pyodide. Executes learner code with fresh globals, scripted input(),
# a clean working directory seeded with lesson files, and captured output.
import ast, builtins, io, json, os, shutil, sys, traceback

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

def run(code, stdin=None, files=None, check=None):
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
    try:
        try:
            exec(compile(code, "<student>", "exec"), g)
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

def handle(req_json):
    req = json.loads(req_json)
    if req["kind"] == "run":
        return json.dumps(run(req["code"], req.get("stdin"), req.get("files")))
    if req["kind"] == "grade":
        return json.dumps(grade(req["code"], req["tests"], tuple(req.get("extraAllowed") or ())))
    raise ValueError("unknown request kind")
