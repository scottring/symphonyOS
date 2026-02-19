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
        await MainActor.run { error = nil; isLoading = true }
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

    func signUp(email: String, password: String) async {
        await MainActor.run { error = nil; isLoading = true }
        do {
            let response = try await supabase.auth.signUp(email: email, password: password)
            await MainActor.run {
                currentUser = response.user
                isAuthenticated = response.session != nil
                isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }

    // MARK: - Sign Out

    func signOut() async {
        do {
            try await supabase.auth.signOut()
            await MainActor.run {
                currentUser = nil
                isAuthenticated = false
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
            }
        }
    }
}
