import UIKit
import Capacitor
import Security
import LocalAuthentication
import UserNotifications

@objc(SecureSessionPlugin)
public class SecureSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureSessionPlugin"
    public let jsName = "SecureSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBiometricStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openURL", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPushPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getNotificationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPushToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingPushPath", returnType: CAPPluginReturnPromise)
    ]

    private let service = "com.fourfenterprises.approvehq.session"
    private let account = "mobileToken"
    private let pushTokenKey = "ApproveHQPushDeviceToken"
    private let pushPathKey = "ApproveHQPendingPushPath"

    private func baseQuery() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    @objc func get(_ call: CAPPluginCall) {
        var query = baseQuery(); query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?; let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve([:]); return }
        guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else { call.reject("Could not read secure session."); return }
        call.resolve(["value": value])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), !value.isEmpty, let data = value.data(using: .utf8) else { call.reject("A session value is required."); return }
        let query = baseQuery(); let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { call.resolve(); return }
        if updateStatus != errSecItemNotFound { call.reject("Could not update secure session."); return }
        var insert = query; insert.merge(attributes) { _, new in new }
        guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { call.reject("Could not save secure session."); return }
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound { call.resolve() } else { call.reject("Could not remove secure session.") }
    }

    private func biometricInfo() -> [String: Any] {
        let context = LAContext(); var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        let type: String
        switch context.biometryType { case .faceID: type = "faceID"; case .touchID: type = "touchID"; case .opticID: type = "opticID"; default: type = "none" }
        var result: [String: Any] = ["available": available, "type": type]
        if let error = error { result["error"] = error.localizedDescription }
        return result
    }

    @objc func getBiometricStatus(_ call: CAPPluginCall) { call.resolve(biometricInfo()) }

    @objc func authenticate(_ call: CAPPluginCall) {
        let context = LAContext(); context.localizedCancelTitle = "Use passphrase"; var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else { call.resolve(["available": false, "authenticated": false]); return }
        let reason = call.getString("reason") ?? "Unlock ApproveHQ"
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, authError in
            DispatchQueue.main.async {
                if success { call.resolve(["available": true, "authenticated": true]) }
                else { let nsError = authError as NSError?; call.resolve(["available": true, "authenticated": false, "errorCode": nsError?.code ?? 0]) }
            }
        }
    }

    @objc func openURL(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme?.lowercased() == "https" else { call.reject("Only secure HTTPS links can be opened."); return }
        DispatchQueue.main.async { UIApplication.shared.open(url, options: [:]) { $0 ? call.resolve() : call.reject("Could not open link.") } }
    }

    @objc func requestPushPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            if let error = error { call.reject("Could not request notification permission: \(error.localizedDescription)"); return }
            if granted { DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() } }
            call.resolve(["granted": granted])
        }
    }

    @objc func getNotificationStatus(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let status: String
            switch settings.authorizationStatus { case .authorized: status = "authorized"; case .denied: status = "denied"; case .notDetermined: status = "notDetermined"; case .provisional: status = "provisional"; case .ephemeral: status = "ephemeral"; @unknown default: status = "unknown" }
            let token = UserDefaults.standard.string(forKey: self.pushTokenKey) ?? ""
            #if DEBUG
            let environment = "sandbox"
            #else
            let environment = "production"
            #endif
            call.resolve(["status": status, "registered": !token.isEmpty, "environment": environment])
        }
    }

    @objc func getPushToken(_ call: CAPPluginCall) {
        let token = UserDefaults.standard.string(forKey: pushTokenKey)
        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif
        if let token = token, !token.isEmpty { call.resolve(["deviceToken": token, "environment": environment]) } else { call.resolve(["environment": environment]) }
    }

    @objc func getPendingPushPath(_ call: CAPPluginCall) {
        let defaults = UserDefaults.standard; let path = defaults.string(forKey: pushPathKey); defaults.removeObject(forKey: pushPathKey)
        if let path = path, !path.isEmpty { call.resolve(["path": path]) } else { call.resolve([:]) }
    }
}

class ApproveHQBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() { bridge?.registerPluginInstance(SecureSessionPlugin()) }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var window: UIWindow?; private let pushTokenKey = "ApproveHQPushDeviceToken"; private let pushPathKey = "ApproveHQPendingPushPath"
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool { UNUserNotificationCenter.current().delegate = self; return true }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) { UserDefaults.standard.set(deviceToken.map { String(format: "%02x", $0) }.joined(), forKey: pushTokenKey) }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) { print("ApproveHQ APNs registration failed: \(error.localizedDescription)") }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) { completionHandler([.banner, .sound, .badge]) }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) { if let path = response.notification.request.content.userInfo["path"] as? String, !path.isEmpty { UserDefaults.standard.set(path, forKey: pushPathKey) }; completionHandler() }
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration { let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role); config.delegateClass = SceneDelegate.self; return config }
}
