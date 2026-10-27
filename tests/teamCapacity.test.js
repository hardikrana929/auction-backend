const test = require('node:test');
const assert = require('node:assert/strict');
const { isAuctionAtCapacity, hidePendingWhenFull } = require('../utils/teamCapacity');

test('auction is not full below configured team limit', () => {
  assert.equal(isAuctionAtCapacity({ maxTeams: 10, approvedTeamsCount: 9 }), false);
});

test('auction becomes full exactly at configured team limit', () => {
  assert.equal(isAuctionAtCapacity({ maxTeams: 10, approvedTeamsCount: 10 }), true);
});

test('auction remains full above configured team limit', () => {
  assert.equal(isAuctionAtCapacity({ maxTeams: 10, approvedTeamsCount: 11 }), true);
});

test('pending applications are hidden when auction is full', () => {
  assert.deepEqual(
    hidePendingWhenFull({ auction: 'a1' }, { maxTeams: 2, approvedTeamsCount: 2 }),
    { auction: 'a1', status: { $ne: 'pending' } },
  );
});

test('explicit pending filter returns no pending records while full', () => {
  assert.deepEqual(
    hidePendingWhenFull({ auction: 'a1', status: 'pending' }, { maxTeams: 2, approvedTeamsCount: 2 }),
    { auction: 'a1', status: '__pending_hidden__' },
  );
});

test('explicit approved filter remains intact while full', () => {
  assert.deepEqual(
    hidePendingWhenFull({ auction: 'a1', status: 'approved' }, { maxTeams: 2, approvedTeamsCount: 2 }),
    { auction: 'a1', status: 'approved' },
  );
});

test('pending applications remain visible while slots are available', () => {
  assert.deepEqual(
    hidePendingWhenFull({ auction: 'a1', status: 'pending' }, { maxTeams: 10, approvedTeamsCount: 9 }),
    { auction: 'a1', status: 'pending' },
  );
});
