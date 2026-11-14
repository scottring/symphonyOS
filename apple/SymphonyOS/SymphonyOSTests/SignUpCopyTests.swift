import Testing
@testable import Symphony

struct SignUpCopyTests {
    private let generic = "Database error saving new user"

    @Test func onlyAClosedGateSaysInviteOnly() {
        let r = AuthService.signUpFailure(gate: false, message: nil)
        #expect(r.text == AuthService.inviteOnlyMessage)
        #expect(r.inviteOnly == true)
    }

    @Test func anOpenGateNeverSaysInviteOnly() {
        let r = AuthService.signUpFailure(gate: true, message: generic)
        #expect(r.text == AuthService.signUpFaultMessage)
        #expect(r.inviteOnly == false)
    }

    @Test func anUnansweredGateIsAFaultNotAnInvitation() {
        let r = AuthService.signUpFailure(gate: nil, message: generic)
        #expect(r.text == AuthService.signUpFaultMessage)
        #expect(r.inviteOnly == false)
    }

    @Test func otherFailuresKeepTheirWords() {
        let words = "Password should be at least 6 characters"
        let r = AuthService.signUpFailure(gate: true, message: words)
        #expect(r.text == words)
        #expect(r.inviteOnly == false)
    }

    @Test func theFaultLineHasNoInviteInIt() {
        #expect(!AuthService.signUpFaultMessage.lowercased().contains("invite"))
    }
}
