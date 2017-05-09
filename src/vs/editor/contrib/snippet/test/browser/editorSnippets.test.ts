/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Selection } from 'vs/editor/common/core/selection';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { SnippetSession } from 'vs/editor/contrib/snippet/browser/editorSnippets';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { mockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { Model } from "vs/editor/common/model/model";

suite('SnippetSession', function () {

	let editor: ICommonCodeEditor;
	let model: Model;

	function assertSelections(editor: ICommonCodeEditor, ...s: Selection[]) {
		for (const selection of editor.getSelections()) {
			const actual = s.shift();
			assert.ok(selection.equalsSelection(actual), `actual=${selection.toString()} <> expected=${actual.toString()}`);
		}
		assert.equal(s.length, 0);
	}

	setup(function () {
		model = Model.createFromString('function foo() {\n    console.log(a);\n}');
		editor = mockCodeEditor([], { model });
		editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5)]);
		assert.equal(model.getEOL(), '\n');
	});

	teardown(function () {
		model.dispose();
		editor.dispose();
	});

	test('normalize whitespace', function () {

		function assertNormalized(position: IPosition, input: string, expected: string): void {
			const actual = SnippetSession.normalizeWhitespace(model, position, input);
			assert.equal(actual, expected);
		}

		assertNormalized(new Position(1, 1), 'foo', 'foo');
		assertNormalized(new Position(1, 1), 'foo\rbar', 'foo\nbar');
		assertNormalized(new Position(1, 1), 'foo\rbar', 'foo\nbar');
		assertNormalized(new Position(2, 5), 'foo\r\tbar', 'foo\n        bar');
		assertNormalized(new Position(2, 3), 'foo\r\tbar', 'foo\n      bar');
	});

	test('text edits & selection', function () {
		const session = new SnippetSession(editor, 'foo${1:bar}foo$0');
		assert.equal(editor.getModel().getValue(), 'foobarfoofunction foo() {\n    foobarfooconsole.log(a);\n}');

		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
		session.next();
		assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
	});

	test('snippets, repeated tabstops', function () {
		const session = new SnippetSession(editor, '${1:abc}foo${1:abc}$0');
		assertSelections(editor,
			new Selection(1, 1, 1, 4), new Selection(1, 7, 1, 10),
			new Selection(2, 5, 2, 8), new Selection(2, 11, 2, 14),
		);
		session.next();
		assertSelections(editor,
			new Selection(1, 10, 1, 10),
			new Selection(2, 14, 2, 14),
		);
	});

	test('snippets, selections and new text with newlines', () => {

		const session = new SnippetSession(editor, 'foo\n\t${1:bar}\n$0');

		assert.equal(editor.getModel().getValue(), 'foo\n    bar\nfunction foo() {\n    foo\n        bar\nconsole.log(a);\n}');

		assertSelections(editor, new Selection(2, 5, 2, 8), new Selection(5, 9, 5, 12));

		session.next();
		assertSelections(editor, new Selection(3, 1, 3, 1), new Selection(6, 1, 6, 1));
	});

	test('snippets, selections -> next/prev', () => {

		const session = new SnippetSession(editor, 'f$1oo${2:bar}foo$0');

		// @ $2
		assertSelections(editor, new Selection(1, 2, 1, 2), new Selection(2, 6, 2, 6));
		// @ $1
		session.next();
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
		// @ $2
		session.prev();
		assertSelections(editor, new Selection(1, 2, 1, 2), new Selection(2, 6, 2, 6));
		// @ $1
		session.next();
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
		// @ $0
		session.next();
		assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
	});

	test('snippets, selections & typing', function () {
		const session = new SnippetSession(editor, 'f${1:oo}_$2_$0');

		editor.trigger('test', 'type', { text: 'X' });
		session.next();
		editor.trigger('test', 'type', { text: 'bar' });

		// go back to ${2:oo} which is now just 'X'
		session.prev();
		assertSelections(editor, new Selection(1, 2, 1, 3), new Selection(2, 6, 2, 7));

		// go forward to $1 which is now 'bar'
		session.next();
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));

		// go to final tabstop
		session.next();
		assert.equal(model.getValue(), 'fX_bar_function foo() {\n    fX_bar_console.log(a);\n}');
		assertSelections(editor, new Selection(1, 8, 1, 8), new Selection(2, 12, 2, 12));
	});

	test('snippets, insert shorter snippet into non-empty selection', function () {
		model.setValue('foo_bar_foo');
		editor.setSelections([new Selection(1, 1, 1, 4), new Selection(1, 9, 1, 12)]);

		new SnippetSession(editor, 'x$0');
		assert.equal(model.getValue(), 'x_bar_x');
		assertSelections(editor, new Selection(1, 2, 1, 2), new Selection(1, 8, 1, 8));
	});

	test('snippets, insert longer snippet into non-empty selection', function () {
		model.setValue('foo_bar_foo');
		editor.setSelections([new Selection(1, 1, 1, 4), new Selection(1, 9, 1, 12)]);

		new SnippetSession(editor, 'LONGER$0');
		assert.equal(model.getValue(), 'LONGER_bar_LONGER');
		assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(1, 18, 1, 18));
	});

	test('snippets, don\'t grow final tabstop', function () {
		model.setValue('foo_zzz_foo');
		editor.setSelection(new Selection(1, 5, 1, 8));
		const session = new SnippetSession(editor, '$1bar$0');

		assertSelections(editor, new Selection(1, 5, 1, 5));
		editor.trigger('test', 'type', { text: 'foo-' });

		session.next();
		assert.equal(model.getValue(), 'foo_foo-bar_foo');
		assertSelections(editor, new Selection(1, 12, 1, 12));

		editor.trigger('test', 'type', { text: 'XXX' });
		assert.equal(model.getValue(), 'foo_foo-barXXX_foo');
		session.prev();
		assertSelections(editor, new Selection(1, 5, 1, 9));
		session.next();
		assertSelections(editor, new Selection(1, 15, 1, 15));
	});

	test('snippets, don\'t merge touching tabstops 1/2', function () {

		const session = new SnippetSession(editor, '$1$2$3$0');
		assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));

		session.next();
		assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));

		session.next();
		assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));

		session.next();
		assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));

		session.prev();
		session.prev();
		session.prev();
		assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
		editor.trigger('test', 'type', { text: '111' });

		session.next();
		editor.trigger('test', 'type', { text: '222' });

		session.next();
		editor.trigger('test', 'type', { text: '333' });

		session.next();
		assert.equal(model.getValue(), '111222333function foo() {\n    111222333console.log(a);\n}');
		assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));

		session.prev();
		assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
		session.prev();
		assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
		session.prev();
		assertSelections(editor, new Selection(1, 1, 1, 4), new Selection(2, 5, 2, 8));
	});
	test('snippets, don\'t merge touching tabstops 2/2', function () {

		const session = new SnippetSession(editor, '$1$2$3$0');
		assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));

		editor.trigger('test', 'type', { text: '111' });

		session.next();
		assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
		editor.trigger('test', 'type', { text: '222' });

		session.next();
		assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
		editor.trigger('test', 'type', { text: '333' });

		session.next();
		assert.equal(session.isAtFinalPlaceholder, true);
	});

	test('snippets, gracefully move over final tabstop', function () {
		const session = new SnippetSession(editor, '${1}bar$0');

		assert.equal(session.isAtFinalPlaceholder, false);
		assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));

		session.next();
		assert.equal(session.isAtFinalPlaceholder, true);
		assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));

		session.next();
		assert.equal(session.isAtFinalPlaceholder, true);
		assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
	});

	test('snippets, overwriting nested placeholder', function () {
		const session = new SnippetSession(editor, 'log(${1:"$2"});$0');
		assertSelections(editor, new Selection(1, 5, 1, 7), new Selection(2, 9, 2, 11));

		editor.trigger('test', 'type', { text: 'XXX' });
		assert.equal(model.getValue(), 'log(XXX);function foo() {\n    log(XXX);console.log(a);\n}');

		session.next();
		assert.equal(session.isAtFinalPlaceholder, false);
		// assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));

		session.next();
		assert.equal(session.isAtFinalPlaceholder, true);
		assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
	});

	test('snippets, selections and snippet ranges', function () {
		const session = new SnippetSession(editor, '${1:foo}farboo${2:bar}$0');
		assert.equal(model.getValue(), 'foofarboobarfunction foo() {\n    foofarboobarconsole.log(a);\n}');
		assertSelections(editor, new Selection(1, 1, 1, 4), new Selection(2, 5, 2, 8));

		assert.equal(session.validateSelections(), true);

		editor.setSelections([new Selection(1, 1, 1, 1)]);
		assert.equal(session.validateSelections(), false);

		editor.setSelections([new Selection(1, 6, 1, 6), new Selection(2, 10, 2, 10)]);
		assert.equal(session.validateSelections(), true);

		editor.setSelections([new Selection(1, 6, 1, 6), new Selection(2, 10, 2, 10), new Selection(1, 1, 1, 1)]);
		assert.equal(session.validateSelections(), true);

		editor.setSelections([new Selection(1, 6, 1, 6), new Selection(2, 10, 2, 10), new Selection(2, 20, 2, 21)]);
		assert.equal(session.validateSelections(), false);

		// reset selection to placeholder
		session.next();
		assert.equal(session.validateSelections(), true);
		assertSelections(editor, new Selection(1, 10, 1, 13), new Selection(2, 14, 2, 17));

		// reset selection to placeholder
		session.next();
		assert.equal(session.validateSelections(), true);
		assert.equal(session.isAtFinalPlaceholder, true);
		assertSelections(editor, new Selection(1, 13, 1, 13), new Selection(2, 17, 2, 17));
	});

	test('snippets, nested sessions', function () {

		model.setValue('');
		editor.setSelection(new Selection(1, 1, 1, 1));

		const first = new SnippetSession(editor, 'foo${2:bar}foo$0');
		assert.equal(model.getValue(), 'foobarfoo');
		assertSelections(editor, new Selection(1, 4, 1, 7));

		const second = new SnippetSession(editor, 'ba${1:zzzz}$0');
		assert.equal(model.getValue(), 'foobazzzzfoo');
		assertSelections(editor, new Selection(1, 6, 1, 10));

		second.next();
		assert.equal(second.isAtFinalPlaceholder, true);
		assertSelections(editor, new Selection(1, 10, 1, 10));

		first.next();
		assert.equal(first.isAtFinalPlaceholder, true);
		assertSelections(editor, new Selection(1, 13, 1, 13));

	});

});

