/**
 * The one program Outpost runs to connect a share on a Mac and to keep its password in
 * the Keychain. It is JavaScript for Automation, run by `/usr/bin/osascript`.
 *
 * The text below is a constant. Nothing a person types is ever spliced into it: the
 * server name, the share, the user name and the password arrive as JSON on standard
 * input and are only ever handled as data, so there is nothing to escape and nothing
 * to inject. That also keeps the password out of every process's arguments, which
 * other users of the computer can read.
 *
 * It answers with one line of JSON that never contains the password.
 *
 *   { op: "mount", url, user, password?, remember, keychain: { service, account, label } }
 *     → { status, mountPoints?, stored?, storeStatus? }      status is an errno; 0 is success
 *     → { status: null, keychain }                           no password given and none remembered
 *   { op: "forget", keychain } → { keychain }                0 or -25300 (already gone)
 *
 * Mounting uses NetFS, the same system service the Finder uses, with its "no user
 * interface" option: a wrong password is an answer here, never a dialog on the Mac's
 * screen that nobody at a phone could see.
 */
export const MAC_HELPER = `
ObjC.import("Foundation");
ObjC.import("NetFS");
ObjC.import("Security");

function constant(name) {
  return ObjC.castRefToObject($[name]);
}

function item(keychain) {
  var query = $.NSMutableDictionary.alloc.init;
  query.setObjectForKey(constant("kSecClassGenericPassword"), constant("kSecClass"));
  query.setObjectForKey($(String(keychain.service)), constant("kSecAttrService"));
  query.setObjectForKey($(String(keychain.account)), constant("kSecAttrAccount"));
  return query;
}

function remembered(keychain) {
  var query = item(keychain);
  query.setObjectForKey(true, constant("kSecReturnData"));
  query.setObjectForKey(constant("kSecMatchLimitOne"), constant("kSecMatchLimit"));
  var found = Ref();
  var status = $.SecItemCopyMatching(query, found);
  if (status !== 0) return { status: status };
  var text = $.NSString.alloc.initWithDataEncoding(ObjC.castRefToObject(found[0]), $.NSUTF8StringEncoding);
  return { status: 0, password: text.js };
}

function remember(keychain, password) {
  $.SecItemDelete(item(keychain));
  var entry = item(keychain);
  entry.setObjectForKey($(password).dataUsingEncoding($.NSUTF8StringEncoding), constant("kSecValueData"));
  entry.setObjectForKey($(String(keychain.label)), constant("kSecAttrLabel"));
  return $.SecItemAdd(entry, null);
}

function mount(input) {
  var password = input.password;
  if (typeof password !== "string") {
    var kept = remembered(input.keychain);
    if (kept.status !== 0) return { status: null, keychain: kept.status };
    password = kept.password;
  }
  var open = $.NSMutableDictionary.alloc.init;
  open.setObjectForKey("NoUI", "UIOption");
  var options = $.NSMutableDictionary.alloc.init;
  options.setObjectForKey(true, "SoftMount");
  var points = Ref();
  var status = $.NetFSMountURLSync($.NSURL.URLWithString(String(input.url)), null, $(String(input.user)), $(password), open, options, points);
  var out = { status: status };
  if (status === 0) {
    try {
      out.mountPoints = ObjC.deepUnwrap(ObjC.castRefToObject(points[0]));
    } catch (error) {
      out.mountPoints = [];
    }
    if (input.remember === true) {
      out.storeStatus = remember(input.keychain, password);
      out.stored = out.storeStatus === 0;
    }
  }
  return out;
}

function run() {
  var data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  var input = JSON.parse($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js);
  if (input.op === "mount") return JSON.stringify(mount(input));
  if (input.op === "forget") return JSON.stringify({ keychain: $.SecItemDelete(item(input.keychain)) });
  return JSON.stringify({ error: "unknown" });
}
`;
