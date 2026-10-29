const test = require('node:test');
const assert = require('node:assert/strict');
const { isAuctionAtCapacity, hidePendingWhenFull } = require('../utils/teamCapacity');

test('auction is not full below configured team limit', () => {
  assert.equal(isAuctionAtCapacity({ maxTeams: 10, approvedTeamsCount: 9 }), false);
});

test('auction becomes full exactly at configured team limit', () => {
  assert.equal(isAuctionAtCapacity({ maxTeams: 10, approvedTeamsCount: 10 }), true);
});

test('actual approved count overrides stale cached count', () => {
  assert.equal(isAuctionAtCapacity({ maxTeams: 10, approvedTeamsCount: 10, actualApprovedTeamsCount: 3 }), false);
});

test('auction remains full above configured team limit', () => {
  assert.equal(isAuctionAtCapacity({ maxTeams: 10, approvedTeamsCount: 11 }), true);
});

test('pending applications remain visible even when auction is full', () => {
  assert.deepEqual(
    hidePendingWhenFull({ auction: 'a1', status: 'pending' }, { maxTeams: 10, approvedTeamsCount: 10 }),
    { auction: 'a1', status: 'pending' },
  );
});

test('unfiltered registration lists are not modified when auction is full', () => {
  assert.deepEqual(
    hidePendingWhenFull({ auction: 'a1' }, { maxTeams: 10, approvedTeamsCount: 10 }),
    { auction: 'a1' },
  );
});
