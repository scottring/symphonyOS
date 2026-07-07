import Testing
import Foundation
@testable import Symphony

@Test func appStateDefaults() async throws {
    let state = AppState()
    #expect(state.activeTab == .today)
    #expect(state.domainFilter == .all)
    #expect(state.isToday)
}

@Test func dateNavigation() async throws {
    let state = AppState()
    let today = state.selectedDate

    state.goToNextDay()
    #expect(!Calendar.current.isDate(state.selectedDate, inSameDayAs: today))

    state.goToPreviousDay()
    #expect(Calendar.current.isDate(state.selectedDate, inSameDayAs: today))
}
