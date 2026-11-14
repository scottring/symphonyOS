import Foundation
import Supabase
import Auth

@Observable
final class AuthService {
    var currentUser: User?
    var isAuthenticated = false
    var isLoading = true
    var error: String?

    private var authStateTask: Task<Void, Never>?

    init() {
        #if DEBUG
        if DemoMode.isOn {
            currentUser = DemoMode.user
            isAuthenticated = true
            isLoading = false
            return
        }
        #endif
        startListening()
    }

    deinit {
        authStateTask?.cancel()
    }

    // MARK: - Auth State Listener

    private func startListening() {
        authStateTask = Task { [weak self] in
            for await (event, session) in supabase.auth.authStateChanges {
                guard let self else { return }
                await MainActor.run {
                    switch event {
                    case .initialSession:
                        self.currentUser = session?.user
                        self.isAuthenticated = session?.user != nil
                        self.isLoading = false
                    case .signedIn:
                        self.currentUser = session?.user
                        self.isAuthenticated = true
                        self.isLoading = false
                    case .signedOut:
                        self.currentUser = nil
                        self.isAuthenticated = false
                        self.isLoading = false
                    case .tokenRefreshed:
                        self.currentUser = session?.user
                    default:
                        break
                    }
                    self.error = nil
                }
            }
        }
    }

    // MARK: - Sign In

    func signIn(email: String, password: String) async {
        await MainActor.run { error = nil; inviteOnly = false; isLoading = true }
        do {
            let session = try await supabase.auth.signIn(email: email, password: password)
            await MainActor.run {
                currentUser = session.user
                isAuthenticated = true
                isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }

    // MARK: - Sign Up

    /// Symphony is invite-only while founding households are onboarded by hand.
    ///
    /// The gate lives in the database: a trigger on `auth.users` calls
    /// `public.signup_allowed(email)` and raises if the answer is no. GoTrue
    /// flattens that into a generic failure whose message is "Database error
    /// saving new user" — so somebody who simply hasn't been invited yet is
    /// told the app is broken. Ask the gate first so we can say what is
    /// actually true, and translate the generic message if we hit it anyway.
    static let inviteOnlyMessage =
        "Symphony is invite-only while we set up our founding households by hand. "
        + "Request an invite at symphony-os.com and we'll write back within a day."

    /// True when the last sign-up was turned away by the invite gate rather
    /// than by a fault — nothing to retry, so the view offers the waitlist.
    var inviteOnly = false

    /// Does the gate already know this address can't sign up? Advisory only:
    /// if asking fails, we let the sign-up proceed and the trigger decide.
    private func isSignUpAllowed(email: String) async -> Bool? {
        do {
            return try await supabase
                .rpc("signup_allowed", params: ["p_email": email])
                .execute()
                .value
        } catch {
            return nil
        }
    }

    private static func isInviteGateFailure(_ message: String) -> Bool {
        let lowered = message.lowercased()
        return lowered.contains("database error saving new user")
            || lowered.contains("signups are currently restricted")
    }

    static let signUpFaultMessage = "Symphony couldn’t create your account just now. Please try again in a moment."

    /// What a failed sign-up says. `gate`: what `signup_allowed` answered (nil: it could not be asked).
    /// `message`: the failure's own text (nil: the gate said no before anything was tried).
    /// Only a gate that answered no is "invite-only"; a generic database failure after
    /// a yes (or no answer) is a fault, so nobody is told to request an invite untruthfully.
    static func signUpFailure(gate: Bool?, message: String?) -> (text: String, inviteOnly: Bool) {
        if gate == false { return (inviteOnlyMessage, true) }
        guard let message, !isInviteGateFailure(message) else { return (signUpFaultMessage, false) }
        return (message, false)
    }

    func signUp(email: String, password: String) async {
        await MainActor.run { error = nil; inviteOnly = false; isLoading = true }

        let gate = await isSignUpAllowed(email: email)
        if gate == false {
            let failure = AuthService.signUpFailure(gate: gate, message: nil)
            await MainActor.run {
                self.error = failure.text
                self.inviteOnly = failure.inviteOnly
                self.isLoading = false
            }
            return
        }

        do {
            let response = try await supabase.auth.signUp(email: email, password: password)
            await MainActor.run {
                currentUser = response.user
                isAuthenticated = response.session != nil
                isLoading = false
            }
        } catch {
            let failure = AuthService.signUpFailure(gate: gate, message: error.localizedDescription)
            await MainActor.run {
                self.error = failure.text
                self.inviteOnly = failure.inviteOnly
                self.isLoading = false
            }
        }
    }

    // MARK: - Forget session

    /// Local sign-out after the server deleted this account: the server no
    /// longer knows the user, so a global sign-out would fail. Always clears.
    func forgetSession() async {
        _ = try? await supabase.auth.signOut(scope: .local)
        await MainActor.run {
            currentUser = nil
            isAuthenticated = false
        }
    }

    // MARK: - Sign Out

    func signOut() async {
        do {
            try await supabase.auth.signOut()
            await MainActor.run {
                currentUser = nil
                isAuthenticated = false
                #if os(iOS)
                // Nothing of this account stays on the Home Screen.
                WidgetFeed.clear()
                #endif
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
            }
        }
    }
}
