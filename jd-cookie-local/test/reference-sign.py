"""Synthetic oracle only. No network/filesystem/credentials.
sign_core/get_sign retained from the pinned jd_wskey.py; see NOTICE.md.
The entire upstream program is never imported or executed.
"""
import base64
import hashlib
import json


def sign_core(par):
    arr = [0x37, 0x92, 0x44, 0x68, 0xA5, 0x3D, 0xCC, 0x7F, 0xBB, 0xF, 0xD9, 0x88, 0xEE, 0x9A, 0xE9, 0x5A]
    key2 = b"80306f4370b39fd5630ad0529f77adb6"
    arr1 = [0 for _ in range(len(par))]
    for i in range(len(par)):
        r0 = int(par[i])
        r2 = arr[i & 0xf]
        r4 = int(key2[i & 7])
        r0 = r2 ^ r0
        r0 = r0 ^ r4
        r0 = r0 + r2
        r2 = r2 ^ r0
        r1 = int(key2[i & 7])
        r2 = r2 ^ r1
        arr1[i] = r2 & 0xff
    return bytes(arr1)


def get_sign(functionId, body, uuid, client, clientVersion, st, sv):
    all_arg = "functionId=%s&body=%s&uuid=%s&client=%s&clientVersion=%s&st=%s&sv=%s" % (
        functionId, body, uuid, client, clientVersion, st, sv)
    ret_bytes = sign_core(str.encode(all_arg))
    info = hashlib.md5(base64.b64encode(ret_bytes)).hexdigest()
    return info


bodies = ['{}', '{"中文":"😀&=+/%"}', '{"to":"https%3a%2f%2fplogin.m.jd.com%2fjd-mlogin%2fstatic%2fhtml%2fappjmp_blank.html"}', '"' + '边界' * 32 + '"']
vectors = []
for i in range(32):
    args = dict(functionId='genToken', body=bodies[i % 4], uuid=format(i * 987654321, '016x'),
                client='android', clientVersion='11.1.4', st=1792339199999 + i, sv=['102', '111', '120'][i % 3])
    vectors.append(dict(input=args, expected=get_sign(**args)))
print(json.dumps(vectors, ensure_ascii=True, indent=2))
