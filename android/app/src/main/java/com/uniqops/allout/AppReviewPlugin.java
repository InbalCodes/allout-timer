package com.uniqops.allout;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Google Play's in-app rating sheet. Google decides whether it actually shows (it has its own quota),
 * and never tells us if the user rated, so this always resolves.
 */
@CapacitorPlugin(name = "AppReview")
public class AppReviewPlugin extends Plugin {

    @PluginMethod
    public void requestReview(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(request -> {
            if (!request.isSuccessful() || getActivity() == null) { call.resolve(); return; }
            ReviewInfo info = request.getResult();
            getActivity().runOnUiThread(() ->
                manager.launchReviewFlow(getActivity(), info).addOnCompleteListener(done -> call.resolve()));
        });
    }
}
