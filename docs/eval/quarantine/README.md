# Evaluation quarantine registry

This directory is the proposed registry for temporary flaky-test quarantines.
It currently contains no active quarantine and grants no exception.

Each future entry must name the exact test and immutable target, three controlled
attempt receipts, owner, linked incident, compensating gate, restoration ticket,
created time, and an expiry no more than seven days later. The program evaluation
strategy defines the cap and the evaluation classes that cannot be quarantined.
