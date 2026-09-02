import SwiftUI

struct AuthView: View {
    @Environment(AuthService.self) private var auth
    @State private var isSignUp = false
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 32) {
                    // Header
                    VStack(spacing: 8) {
                        Image("TreeLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 96, height: 96)
                            .clipShape(Circle())

                        Text("Symphony")
                            .font(.displayLarge)
                            .foregroundStyle(Color.textPrimary)

                        Text("Your life, orchestrated")
                            .font(.bodyMedium)
                            .foregroundStyle(Color.textSecondary)
                    }
                    .padding(.top, 60)

                    // Form
                    VStack(spacing: 16) {
                        TextField("Email", text: $email)
                            .textFieldStyle(.symphony)
                            .textContentType(.emailAddress)
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            #endif

                        SecureField("Password", text: $password)
                            .textFieldStyle(.symphony)
                            .textContentType(isSignUp ? .newPassword : .password)

                        if isSignUp {
                            SecureField("Confirm Password", text: $confirmPassword)
                                .textFieldStyle(.symphony)
                                .textContentType(.newPassword)
                        }

                        if let error = auth.error {
                            Text(error)
                                .font(.bodySmall)
                                .foregroundStyle(Color.feedbackRed)
                                .multilineTextAlignment(.center)
                        }

                        Button {
                            Task { await submit() }
                        } label: {
                            HStack {
                                if auth.isLoading {
                                    ProgressView()
                                        .tint(.white)
                                }
                                Text(isSignUp ? "Create Account" : "Sign In")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.symphony)
                        .disabled(!isValid || auth.isLoading)
                        .opacity(isValid ? 1.0 : 0.6)
                    }
                    .padding(.horizontal, 24)

                    // Toggle
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            isSignUp.toggle()
                            confirmPassword = ""
                        }
                    } label: {
                        Text(isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up")
                            .font(.bodySmall)
                            .foregroundStyle(Color.primaryTint)
                    }
                }
            }
        }
    }

    private var isValid: Bool {
        let hasEmail = !email.trimmingCharacters(in: .whitespaces).isEmpty
        let hasPassword = password.count >= 6
        if isSignUp {
            return hasEmail && hasPassword && password == confirmPassword
        }
        return hasEmail && hasPassword
    }

    private func submit() async {
        if isSignUp {
            await auth.signUp(email: email.trimmingCharacters(in: .whitespaces), password: password)
        } else {
            await auth.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
        }
    }
}

#Preview {
    AuthView()
        .environment(AuthService())
}
